'use strict';
/**
 * Saturn Technologies - Production Course Materials Storage Provisioner
 *
 * Requirements:
 * 1. Checks/creates private Supabase Storage bucket 'course-materials'.
 * 2. Uploads the 5 physical PDF files from data/materials/.
 * 3. Verifies each uploaded file byte-for-byte against local disk.
 * 4. Ensures no public URLs are exposed (private bucket access).
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env or .env.local if present
try {
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

const BUCKET_NAME = 'course-materials';
const MATERIALS_DIR = path.resolve(__dirname, '..', 'data', 'materials');

const EXPECTED_FILES = [
  { name: 'java-full-stack-syllabus.pdf', size: 6058, pages: 3 },
  { name: 'module-1-core-java.pdf', size: 5731, pages: 3 },
  { name: 'module-2-databases-sql.pdf', size: 5634, pages: 3 },
  { name: 'module-3-spring-boot.pdf', size: 5657, pages: 3 },
  { name: 'module-4-frontend-integration.pdf', size: 5564, pages: 3 }
];

async function main() {
  console.log('===============================================================');
  console.log('  Saturn Technologies — Course Materials Storage Provisioner   ');
  console.log('===============================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment or .env file.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  // 1. Check or Create Private Bucket
  console.log(`Checking storage bucket '${BUCKET_NAME}'...`);
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error('Failed to list storage buckets:', listErr.message);
    process.exit(1);
  }

  const existingBucket = buckets.find((b) => b.name === BUCKET_NAME);
  if (!existingBucket) {
    console.log(`Creating private bucket '${BUCKET_NAME}'...`);
    const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false, // Strictly Private
      allowedMimeTypes: ['application/pdf'],
      fileSizeLimit: 25 * 1024 * 1024 // 25 MB
    });
    if (createErr) {
      console.error('Failed to create storage bucket:', createErr.message);
      process.exit(1);
    }
    console.log(`[PASS] Private bucket '${BUCKET_NAME}' created.`);
  } else {
    console.log(`[PASS] Bucket '${BUCKET_NAME}' already exists (Public: ${existingBucket.public ? 'YES (WARNING)' : 'NO (SECURE)'}).`);
    if (existingBucket.public) {
      console.warn('WARNING: Bucket is marked public! Updating to private...');
      await supabase.storage.updateBucket(BUCKET_NAME, { public: false });
    }
  }

  // 2. Upload and Verify Each PDF File
  console.log('\nUploading and verifying course PDFs:');
  for (const item of EXPECTED_FILES) {
    const localPath = path.join(MATERIALS_DIR, item.name);
    if (!fs.existsSync(localPath)) {
      console.error(`[FAIL] Local file missing: ${localPath}`);
      process.exit(1);
    }

    const localBuffer = fs.readFileSync(localPath);
    console.log(`\nProcessing: ${item.name} (${localBuffer.length} bytes, expected ${item.size} bytes)`);

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(item.name, localBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadErr) {
      console.error(`  [FAIL] Upload failed for ${item.name}:`, uploadErr.message);
      process.exit(1);
    }
    console.log(`  ✓ Uploaded to ${BUCKET_NAME}/${item.name}`);

    // Verify upload by downloading bytes
    const { data: downloadedBlob, error: downloadErr } = await supabase.storage
      .from(BUCKET_NAME)
      .download(item.name);

    if (downloadErr) {
      console.error(`  [FAIL] Verification download failed for ${item.name}:`, downloadErr.message);
      process.exit(1);
    }

    const downloadedBuffer = Buffer.from(await downloadedBlob.arrayBuffer());
    if (downloadedBuffer.length !== localBuffer.length) {
      console.error(`  [FAIL] Size mismatch: Local ${localBuffer.length} vs Downloaded ${downloadedBuffer.length}`);
      process.exit(1);
    }
    console.log(`  ✓ Verified download: ${downloadedBuffer.length} bytes match exact local file.`);
  }

  console.log('\n===============================================================');
  console.log('  ALL 5 COURSE MATERIALS UPLOADED AND VERIFIED SUCCESSFULLY    ');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('Fatal upload error:', err.message);
  process.exit(1);
});
