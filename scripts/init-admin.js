'use strict';
/**
 * Saturn Technologies - Secure Production Admin Initializer
 *
 * Requirements:
 * 1. Password entered via raw-mode hidden terminal prompt (zero terminal echo, no shell history).
 * 2. Backspace, Enter, Ctrl+C, and terminal state restoration handled reliably.
 * 3. Preserves exact password whitespace and characters (no trimming).
 * 4. Confirmation verified via exact string equality.
 * 5. Scrypt byte-for-byte parity with src/db.js (16-byte salt, 64-byte key, salt$hash format).
 * 6. Preserves single-admin constraint.
 * 7. Never prints or logs the password, password hash, or service-role key.
 */
const crypto = require('crypto');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

function promptHidden(label) {
  if (!process.stdin.isTTY) {
    console.error('Error: Interactive TTY terminal required for secure hidden password entry.');
    process.exit(1);
  }

  return new Promise((resolve) => {
    process.stdout.write(label);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let input = '';

    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw || false);
      }
      stdin.pause();
    };

    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') { // Ctrl+C
          cleanup();
          process.stdout.write('\n');
          process.exit(130);
        } else if (char === '\r' || char === '\n') { // Enter
          cleanup();
          process.stdout.write('\n');
          return resolve(input); // Preserve exact characters (no trimming)
        } else if (char === '\u0008' || char === '\x7f') { // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += char;
        }
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function promptVisible(label) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(label, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

/**
 * Byte-for-byte scrypt hashing matching src/db.js:
 * Salt: 16 bytes random
 * Derived key: 64 bytes
 * Format: `${saltHex}$${derivedKeyHex}`
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('Error: Interactive TTY terminal required for secure hidden administrator password entry.');
    process.exit(1);
  }

  console.log('===============================================================');
  console.log('  Saturn Technologies — Secure Master Admin Provisioner       ');
  console.log('===============================================================\n');

  // Load .env or .env.local if present
  try {
    const fs = require('fs');
    const path = require('path');
    for (const p of ['.env', '.env.local']) {
      const full = path.resolve(p);
      if (fs.existsSync(full)) {
        const lines = fs.readFileSync(full, 'utf8').split('\n');
        for (const l of lines) {
          const t = l.trim();
          if (!t || t.startsWith('#')) continue;
          const idx = t.indexOf('=');
          if (idx > 0) {
            const k = t.slice(0, idx).trim();
            let v = t.slice(idx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (!process.env[k]) process.env[k] = v;
          }
        }
      }
    }
  } catch (_) {}

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment or .env file.');
    process.exit(1);
  }

  const emailInput = await promptVisible('Enter Master Admin Email [admin@saturn.in]: ');
  const adminEmail = (emailInput || 'admin@saturn.in').toLowerCase();

  let password = '';
  let confirmPassword = '';

  try {
    password = await promptHidden('Enter Master Admin Password (minimum 12 characters): ');
    if (password.length < 12) {
      console.error('Error: Admin password must be at least 12 characters long.');
      process.exit(1);
    }

    confirmPassword = await promptHidden('Confirm Master Admin Password: ');
    if (password !== confirmPassword) {
      console.error('Error: Passwords do not match. Aborting.');
      process.exit(1);
    }
  } catch (err) {
    console.error('\nInput cancelled.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  // Verify single-admin constraint
  const { data: existing, error: queryErr } = await supabase
    .from('admins')
    .select('id, email');

  if (queryErr) {
    console.error('Database connection error:', queryErr.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.error(`Aborted: Master administrator already exists in database (${existing[0].email}).`);
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  const adminId = 'adm_' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  const { error: insertErr } = await supabase.from('admins').insert({
    id: adminId,
    email: adminEmail,
    role: 'SUPER_ADMIN',
    password_hash: passwordHash,
    created_at: now,
    updated_at: now
  });

  if (insertErr) {
    console.error('Admin insertion failed:', insertErr.message);
    process.exit(1);
  }

  console.log(`\n[SUCCESS] Master administrator provisioned successfully.`);
  console.log(`[IDENTITY] Admin Email: ${adminEmail}`);
  console.log(`[SECURITY] Single-admin slot locked. Password securely hashed with scrypt.`);
}

main().catch((err) => {
  console.error('Fatal initialization error:', err.message);
  process.exit(1);
});
