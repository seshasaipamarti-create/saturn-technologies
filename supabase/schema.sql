-- ============================================================================
-- SATURN TECHNOLOGIES INDIA PRIVATE LIMITED
-- SUPABASE POSTGRESQL PRODUCTION DDL (PHASE 1 CLEAN PRODUCTION)
-- ============================================================================
-- Safety: Wrapped in a transaction. Intended exclusively for a clean Supabase database.
-- Zero passwords, hashes, or testing data are seeded in this script.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. TABLE DEFINITIONS & INTEGRITY CONSTRAINTS
-- ----------------------------------------------------------------------------

-- 2.1 MASTER ADMINISTRATOR
-- Enforces strictly ONE administrative slot at the database level.
CREATE TABLE IF NOT EXISTS public.admins (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(32) DEFAULT 'SUPER_ADMIN' NOT NULL CHECK (role = 'SUPER_ADMIN'),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Database-level mathematical guarantee: exactly 0 or 1 row can ever exist in admins.
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_master_admin ON public.admins ((true));

-- 2.2 STUDENTS
CREATE TABLE IF NOT EXISTS public.students (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    contact_number VARCHAR(32) NOT NULL,
    college_name VARCHAR(255) NOT NULL,
    academic_year VARCHAR(64) NOT NULL,
    degree VARCHAR(128) NOT NULL,
    referral_code VARCHAR(64) UNIQUE,
    password_hash TEXT NOT NULL,
    referral_balance NUMERIC(10, 2) DEFAULT 0.00 NOT NULL CHECK (referral_balance >= 0),
    status VARCHAR(32) DEFAULT 'ACTIVE' NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_email ON public.students(email);
CREATE INDEX IF NOT EXISTS idx_students_referral_code ON public.students(referral_code);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);

-- 2.3 STUDENT SESSIONS (Ephemeral authentication store)
CREATE TABLE IF NOT EXISTS public.student_sessions (
    token VARCHAR(128) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at BIGINT NOT NULL -- Milliseconds since epoch
);
CREATE INDEX IF NOT EXISTS idx_student_sessions_student_id ON public.student_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_student_sessions_expires_at ON public.student_sessions(expires_at);

-- 2.4 ADMIN SESSIONS (24-hour administrative token store)
CREATE TABLE IF NOT EXISTS public.admin_sessions (
    token VARCHAR(128) PRIMARY KEY,
    admin_id VARCHAR(64) NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at BIGINT NOT NULL -- Milliseconds since epoch
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON public.admin_sessions(expires_at);

-- 2.5 COURSE ENROLLMENTS
CREATE TABLE IF NOT EXISTS public.enrollments (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
    course_id VARCHAR(64) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    amount NUMERIC(10, 2) DEFAULT 5000.00 NOT NULL CHECK (amount > 0),
    currency VARCHAR(8) DEFAULT 'INR' NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING' NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
    referral_code_used VARCHAR(64),
    cashfree_order_id VARCHAR(128) UNIQUE,
    cashfree_payment_id VARCHAR(128),
    payment_method VARCHAR(64),
    payment_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Composite integrity key: binds enrollment identity to specific student
    CONSTRAINT uq_enrollment_identity UNIQUE (id, student_id),
    -- Composite integrity key: binds order identity to expected amount and currency
    CONSTRAINT uq_enrollment_order_spec UNIQUE (cashfree_order_id, amount, currency),
    -- Composite integrity key: binds enrollment to student and order for referral attribution
    CONSTRAINT uq_enrollment_full_ref UNIQUE (id, student_id, cashfree_order_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_order_id ON public.enrollments(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);

-- 2.6 PAYMENTS (Financial Ledger with Webhook Replay & Cross-Student Prevention)
CREATE TABLE IF NOT EXISTS public.payments (
    id VARCHAR(64) PRIMARY KEY,
    receipt_number VARCHAR(128),
    enrollment_id VARCHAR(64) NOT NULL,
    student_id VARCHAR(64) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    order_id VARCHAR(128) NOT NULL,
    cf_payment_id VARCHAR(128),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(8) DEFAULT 'INR' NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('PAID', 'FAILED', 'PENDING')),
    method VARCHAR(64),
    raw_details JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- CROSS-STUDENT ACTIVATION PREVENTION:
    -- Guarantees payment student_id and enrollment_id point to the exact same student in enrollments
    CONSTRAINT fk_payment_enrollment_student FOREIGN KEY (enrollment_id, student_id)
        REFERENCES public.enrollments (id, student_id) ON DELETE RESTRICT,
    -- ORDER SPECIFICATION INTEGRITY:
    -- Guarantees payment amount and currency match the enrollment order specification
    CONSTRAINT fk_payment_order_spec FOREIGN KEY (order_id, amount, currency)
        REFERENCES public.enrollments (cashfree_order_id, amount, currency) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- PAYMENT INTEGRITY RULE 1:
-- Cashfree transaction reference (cf_payment_id) must be unique whenever present.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_cf_payment_id 
ON public.payments (cf_payment_id) 
WHERE (cf_payment_id IS NOT NULL AND cf_payment_id <> '');

-- PAYMENT INTEGRITY RULE 2:
-- At most ONE successful payment can exist for any given order_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_successful_payment_per_order 
ON public.payments (order_id) 
WHERE (status = 'PAID');

-- PAYMENT INTEGRITY RULE 3:
-- At most ONE successful payment can exist for any given enrollment_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_successful_payment_per_enrollment 
ON public.payments (enrollment_id) 
WHERE (status = 'PAID');

-- PAYMENT INTEGRITY RULE 4:
-- Receipt numbers must be globally unique across all payments whenever issued.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_receipt_number 
ON public.payments (receipt_number) 
WHERE (receipt_number IS NOT NULL AND receipt_number <> '');

-- 2.7 REFERRAL REWARDS (Ledger with Composite Cross-Entity Verification)
CREATE TABLE IF NOT EXISTS public.referral_rewards (
    id VARCHAR(64) PRIMARY KEY,
    referrer_student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
    referred_student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
    referred_student_email VARCHAR(255) NOT NULL,
    referred_student_degree VARCHAR(128),
    referred_student_college VARCHAR(255),
    enrollment_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(128) NOT NULL,
    referral_code VARCHAR(64) NOT NULL,
    reward_amount NUMERIC(10, 2) DEFAULT 1000.00 NOT NULL CHECK (reward_amount >= 0),
    currency VARCHAR(8) DEFAULT 'INR' NOT NULL,
    status VARCHAR(64) DEFAULT 'MONEY UNCREDITED' NOT NULL 
        CHECK (status IN ('MONEY UNCREDITED', 'REFERRAL CLAIM IN PROCESS', 'REFERRAL SUCCESSFULLY CREDITED')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    credited_at TIMESTAMPTZ,
    admin_notes TEXT,
    -- REFERRAL INTEGRITY RULE 1: Exactly ONE reward per enrollment
    CONSTRAINT uq_reward_enrollment UNIQUE (enrollment_id),
    -- REFERRAL INTEGRITY RULE 2: Anti-self-referral constraint
    CONSTRAINT chk_no_self_referral CHECK (referrer_student_id <> referred_student_id),
    -- REFERRAL INTEGRITY RULE 3: State-timestamp synchronization
    CONSTRAINT chk_reward_credited_consistency CHECK (
        (status = 'REFERRAL SUCCESSFULLY CREDITED' AND credited_at IS NOT NULL) OR
        (status <> 'REFERRAL SUCCESSFULLY CREDITED' AND credited_at IS NULL)
    ),
    -- REFERRAL INTEGRITY RULE 4 (COMPOSITE FOREIGN KEY):
    -- Mathematically guarantees referred_student_id and order_id strictly belong to the referenced enrollment
    CONSTRAINT fk_reward_enrollment_student_order FOREIGN KEY (enrollment_id, referred_student_id, order_id)
        REFERENCES public.enrollments (id, student_id, cashfree_order_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_rewards_referrer ON public.referral_rewards(referrer_student_id);
CREATE INDEX IF NOT EXISTS idx_rewards_referred ON public.referral_rewards(referred_student_id);
CREATE INDEX IF NOT EXISTS idx_rewards_status ON public.referral_rewards(status);

-- 2.8 REFERRAL CREDITS LEDGER (Immutable Financial Audit Ledger & Double-Credit Prevention)
CREATE TABLE IF NOT EXISTS public.referral_credits_ledger (
    id VARCHAR(64) PRIMARY KEY,
    reward_id VARCHAR(64) NOT NULL UNIQUE REFERENCES public.referral_rewards(id) ON DELETE RESTRICT,
    referrer_student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(8) DEFAULT 'INR' NOT NULL,
    admin_id VARCHAR(64) NOT NULL REFERENCES public.admins(id) ON DELETE RESTRICT,
    admin_email VARCHAR(255) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referral_credits_referrer ON public.referral_credits_ledger(referrer_student_id);
CREATE INDEX IF NOT EXISTS idx_referral_credits_reward ON public.referral_credits_ledger(reward_id);

-- 2.9 COURSE MATERIALS METADATA
CREATE TABLE IF NOT EXISTS public.materials (
    id VARCHAR(64) PRIMARY KEY,
    course_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(128) NOT NULL,
    description TEXT,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    page_count INT DEFAULT 1 NOT NULL CHECK (page_count > 0),
    storage_path VARCHAR(512) NOT NULL,
    display_order INT DEFAULT 0 NOT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_course_id ON public.materials(course_id);

-- 2.9 PERSISTENT FAILED LOGIN RATE LIMITS
CREATE TABLE IF NOT EXISTS public.rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    attempts INT DEFAULT 1 NOT NULL CHECK (attempts >= 0),
    first_attempt_at BIGINT NOT NULL, -- Milliseconds since epoch
    last_attempt_at BIGINT NOT NULL   -- Milliseconds since epoch
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_first_attempt ON public.rate_limits(first_attempt_at);

-- 2.10 ADMIN AUDIT TRAIL
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    admin_id VARCHAR(64) REFERENCES public.admins(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    details JSONB,
    admin_email VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_timestamp ON public.admin_audit_logs(timestamp DESC);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) ZERO-TRUST ENFORCEMENT
-- ----------------------------------------------------------------------------
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_credits_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny direct public access to admins" ON public.admins;
CREATE POLICY "Deny direct public access to admins" ON public.admins FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to admin_sessions" ON public.admin_sessions;
CREATE POLICY "Deny direct public access to admin_sessions" ON public.admin_sessions FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to students" ON public.students;
CREATE POLICY "Deny direct public access to students" ON public.students FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to student_sessions" ON public.student_sessions;
CREATE POLICY "Deny direct public access to student_sessions" ON public.student_sessions FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to enrollments" ON public.enrollments;
CREATE POLICY "Deny direct public access to enrollments" ON public.enrollments FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to payments" ON public.payments;
CREATE POLICY "Deny direct public access to payments" ON public.payments FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to referral_rewards" ON public.referral_rewards;
CREATE POLICY "Deny direct public access to referral_rewards" ON public.referral_rewards FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to referral_credits_ledger" ON public.referral_credits_ledger;
CREATE POLICY "Deny direct public access to referral_credits_ledger" ON public.referral_credits_ledger FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to materials" ON public.materials;
CREATE POLICY "Deny direct public access to materials" ON public.materials FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to rate_limits" ON public.rate_limits;
CREATE POLICY "Deny direct public access to rate_limits" ON public.rate_limits FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct public access to admin_audit_logs" ON public.admin_audit_logs;
CREATE POLICY "Deny direct public access to admin_audit_logs" ON public.admin_audit_logs FOR ALL TO anon, authenticated USING (false);

-- ----------------------------------------------------------------------------
-- 4. VERIFIED COURSE MATERIALS METADATA SEED (EXACT PARITY WITH LOCAL PDFS)
-- ----------------------------------------------------------------------------
INSERT INTO public.materials (id, course_id, title, category, description, file_name, file_size, page_count, storage_path, display_order, active, updated_at)
VALUES
    ('mat_jfs_001', 'java-full-stack', 'Course Syllabus & Curriculum Overview', 'Curriculum', 'Complete roadmap, timeline, and topics for the Java Full Stack programme.', 'java-full-stack-syllabus.pdf', 6058, 3, 'course-materials/java-full-stack-syllabus.pdf', 1, TRUE, NOW()),
    ('mat_jfs_002', 'java-full-stack', 'Module 1: Core Java & OOP Concepts', 'Core Java', 'OOP, inheritance, collections framework, exception handling, and streams.', 'module-1-core-java.pdf', 5731, 3, 'course-materials/module-1-core-java.pdf', 2, TRUE, NOW()),
    ('mat_jfs_003', 'java-full-stack', 'Module 2: Databases & SQL Essentials', 'Databases', 'Relational database design, indexing, transactions, and PostgreSQL queries.', 'module-2-databases-sql.pdf', 5634, 3, 'course-materials/module-2-databases-sql.pdf', 3, TRUE, NOW()),
    ('mat_jfs_004', 'java-full-stack', 'Module 3: Spring Boot & REST APIs', 'Backend', 'Building production REST APIs, dependency injection, JPA, and security.', 'module-3-spring-boot.pdf', 5657, 3, 'course-materials/module-3-spring-boot.pdf', 4, TRUE, NOW()),
    ('mat_jfs_005', 'java-full-stack', 'Module 4: Frontend Integration & Deployment', 'Full Stack', 'Connecting frontend clients, JWT auth, CI/CD pipelines, and cloud hosting.', 'module-4-frontend-integration.pdf', 5564, 3, 'course-materials/module-4-frontend-integration.pdf', 5, TRUE, NOW())
ON CONFLICT (id) DO UPDATE SET
    file_size = EXCLUDED.file_size,
    page_count = EXCLUDED.page_count,
    storage_path = EXCLUDED.storage_path,
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 5. ATOMIC STORED PROCEDURES (SECURITY DEFINER WITH FIXED SEARCH PATH)
-- ----------------------------------------------------------------------------

-- 5.1 ATOMIC VERIFIED PAYMENT ACTIVATION
CREATE OR REPLACE FUNCTION public.activate_verified_payment(
    p_order_id VARCHAR,
    p_cf_payment_id VARCHAR,
    p_payment_method VARCHAR,
    p_payment_timestamp TIMESTAMPTZ,
    p_amount NUMERIC,
    p_currency VARCHAR,
    p_raw_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_enrollment RECORD;
    v_existing_payment RECORD;
    v_existing_cf_order VARCHAR;
    v_receipt_number VARCHAR;
    v_receipt_seed VARCHAR;
    v_payment_id VARCHAR;
    v_student RECORD;
    v_new_referral_code VARCHAR;
    v_referrer RECORD;
    v_reward_id VARCHAR;
    v_reward_created BOOLEAN := FALSE;
    v_reward_inserted INTEGER := 0;
BEGIN
    -- 1. Lock and retrieve enrollment row
    SELECT * INTO v_enrollment 
    FROM public.enrollments 
    WHERE cashfree_order_id = p_order_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ENROLLMENT_NOT_FOUND', 'message', 'No enrollment found matching order ID.');
    END IF;

    -- 2. Validate Amount and Currency Parity
    IF v_enrollment.amount <> p_amount OR v_enrollment.currency <> p_currency THEN
        RETURN jsonb_build_object('success', false, 'code', 'AMOUNT_CURRENCY_MISMATCH', 'message', 'Payment amount or currency does not match enrollment specification.');
    END IF;

    -- 3. Cross-Order Payment ID Conflict Check
    IF p_cf_payment_id IS NOT NULL AND p_cf_payment_id <> '' THEN
        SELECT order_id INTO v_existing_cf_order 
        FROM public.payments 
        WHERE cf_payment_id = p_cf_payment_id;

        IF FOUND AND v_existing_cf_order <> p_order_id THEN
            RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_ID_CONFLICT', 'message', 'Cashfree payment ID is already associated with another order.');
        END IF;
    END IF;

    -- 4. Idempotency Check: Already Paid
    IF v_enrollment.status = 'PAID' THEN
        SELECT * INTO v_existing_payment 
        FROM public.payments 
        WHERE order_id = p_order_id AND status = 'PAID';

        IF FOUND THEN
            -- Payment identity must match exactly
            IF p_cf_payment_id IS NULL OR p_cf_payment_id = '' OR 
               (v_existing_payment.cf_payment_id IS NOT NULL AND v_existing_payment.cf_payment_id <> p_cf_payment_id) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'PAYMENT_ID_MISMATCH',
                    'message', 'Conflicting or missing payment ID for already-paid order.'
                );
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'enrollment_id', v_enrollment.id,
                'payment_id', v_existing_payment.id,
                'receipt_number', v_existing_payment.receipt_number,
                'status', 'PAID',
                'message', 'Payment already verified previously.'
            );
        END IF;
    END IF;

    -- 5. Mark Enrollment PAID
    UPDATE public.enrollments 
    SET status = 'PAID',
        cashfree_payment_id = p_cf_payment_id,
        payment_method = COALESCE(p_payment_method, 'ONLINE'),
        payment_timestamp = COALESCE(p_payment_timestamp, NOW()),
        updated_at = NOW()
    WHERE id = v_enrollment.id;

    -- 6. Ensure Paid Student Receives Active Referral Code
    SELECT * INTO v_student FROM public.students WHERE id = v_enrollment.student_id FOR UPDATE;
    IF v_student.referral_code IS NULL THEN
        v_new_referral_code := 'SATURN-REFE-' || UPPER(SUBSTRING(MD5(v_student.id || CLOCK_TIMESTAMP()::text) FROM 1 FOR 6));
        UPDATE public.students 
        SET referral_code = v_new_referral_code, 
            updated_at = NOW() 
        WHERE id = v_student.id;
    END IF;

    -- 7. Generate Collision-Resistant Unique Receipt Number & Insert Payment Record
    v_receipt_seed := UPPER(REGEXP_REPLACE(p_order_id, '[^a-zA-Z0-9]', '', 'g'));
    v_receipt_seed := SUBSTRING(v_receipt_seed FROM GREATEST(1, LENGTH(v_receipt_seed)-7) FOR 8);
    v_receipt_number := 'SATURN-REC-2026-' || v_receipt_seed || '-' || UPPER(SUBSTRING(MD5(p_order_id || CLOCK_TIMESTAMP()::text) FROM 1 FOR 4));

    WHILE EXISTS (SELECT 1 FROM public.payments WHERE receipt_number = v_receipt_number) LOOP
        v_receipt_number := 'SATURN-REC-2026-' || v_receipt_seed || '-' || UPPER(SUBSTRING(MD5(CLOCK_TIMESTAMP()::text || RANDOM()::text) FROM 1 FOR 6));
    END LOOP;

    v_payment_id := 'pay_' || SUBSTRING(MD5(p_order_id || p_cf_payment_id || CLOCK_TIMESTAMP()::text) FROM 1 FOR 16);

    INSERT INTO public.payments (
        id, receipt_number, enrollment_id, student_id, course_name, 
        order_id, cf_payment_id, amount, currency, status, method, raw_details, timestamp
    ) VALUES (
        v_payment_id, v_receipt_number, v_enrollment.id, v_enrollment.student_id, v_enrollment.course_name,
        p_order_id, p_cf_payment_id, p_amount, p_currency, 'PAID', COALESCE(p_payment_method, 'ONLINE'), p_raw_details, COALESCE(p_payment_timestamp, NOW())
    );

    -- 8. Referral Reward Creation (strictly if referrer is eligible paid student)
    IF v_enrollment.referral_code_used IS NOT NULL THEN
        SELECT * INTO v_referrer 
        FROM public.students 
        WHERE referral_code = v_enrollment.referral_code_used;

        IF FOUND AND v_referrer.id <> v_enrollment.student_id THEN
            IF EXISTS (SELECT 1 FROM public.enrollments WHERE student_id = v_referrer.id AND status = 'PAID') THEN
                v_reward_id := 'rew_' || SUBSTRING(MD5(v_enrollment.id || CLOCK_TIMESTAMP()::text) FROM 1 FOR 16);
                
                INSERT INTO public.referral_rewards (
                    id, referrer_student_id, referred_student_id, referred_student_email,
                    referred_student_degree, referred_student_college, enrollment_id, order_id,
                    referral_code, reward_amount, currency, status, created_at, updated_at
                ) VALUES (
                    v_reward_id, v_referrer.id, v_enrollment.student_id, v_student.email,
                    v_student.degree, v_student.college_name, v_enrollment.id, p_order_id,
                    v_enrollment.referral_code_used, 1000.00, 'INR', 'MONEY UNCREDITED', NOW(), NOW()
                )
                ON CONFLICT (enrollment_id) DO NOTHING;
                
                GET DIAGNOSTICS v_reward_inserted = ROW_COUNT;
                v_reward_created := (v_reward_inserted > 0);
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'enrollment_id', v_enrollment.id,
        'payment_id', v_payment_id,
        'receipt_number', v_receipt_number,
        'referral_reward_created', v_reward_created,
        'status', 'PAID',
        'message', 'Payment processed and enrollment activated successfully.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_verified_payment FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_verified_payment TO service_role;

-- 5.2 ATOMIC REFERRAL REWARD CREDITING & FINANCIAL LEDGER
CREATE OR REPLACE FUNCTION public.credit_referral_reward(
    p_reward_id VARCHAR,
    p_admin_id VARCHAR,
    p_admin_email VARCHAR,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reward RECORD;
    v_credit_ledger_id VARCHAR;
    v_audit_id VARCHAR;
    v_new_balance NUMERIC(10, 2);
BEGIN
    -- 1. Verify acting admin
    IF NOT EXISTS (SELECT 1 FROM public.admins WHERE id = p_admin_id AND email = p_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_ADMIN', 'message', 'Acting administrator authorization invalid.');
    END IF;

    -- 2. Lock reward row
    SELECT * INTO v_reward FROM public.referral_rewards WHERE id = p_reward_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Referral reward record not found.');
    END IF;

    -- 3. Prevent duplicate credit
    IF v_reward.status = 'REFERRAL SUCCESSFULLY CREDITED' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CREDITED', 'message', 'This reward has already been credited.');
    END IF;

    -- 4. Update reward status atomically
    UPDATE public.referral_rewards 
    SET status = 'REFERRAL SUCCESSFULLY CREDITED',
        credited_at = NOW(),
        updated_at = NOW(),
        admin_notes = COALESCE(p_notes, admin_notes)
    WHERE id = p_reward_id;

    -- 5. Insert into Immutable Referral Credits Ledger (financial record with uniqueness guarantee)
    v_credit_ledger_id := 'crd_' || SUBSTRING(MD5(p_reward_id || CLOCK_TIMESTAMP()::text) FROM 1 FOR 16);
    INSERT INTO public.referral_credits_ledger (
        id, reward_id, referrer_student_id, amount, currency, admin_id, admin_email, notes, created_at
    ) VALUES (
        v_credit_ledger_id, p_reward_id, v_reward.referrer_student_id, v_reward.reward_amount, v_reward.currency,
        p_admin_id, p_admin_email, p_notes, NOW()
    );

    -- 6. Update Referrer Withdrawable Balance Atomically
    UPDATE public.students
    SET referral_balance = referral_balance + v_reward.reward_amount,
        updated_at = NOW()
    WHERE id = v_reward.referrer_student_id
    RETURNING referral_balance INTO v_new_balance;

    -- 7. Record in Admin Audit Log
    v_audit_id := 'aud_' || SUBSTRING(MD5(p_reward_id || CLOCK_TIMESTAMP()::text) FROM 1 FOR 16);
    INSERT INTO public.admin_audit_logs (id, admin_id, action, details, admin_email, timestamp)
    VALUES (
        v_audit_id,
        p_admin_id,
        'REFERRAL_REWARD_CREDITED',
        jsonb_build_object(
            'reward_id', p_reward_id,
            'credit_ledger_id', v_credit_ledger_id,
            'previous_status', v_reward.status,
            'new_status', 'REFERRAL SUCCESSFULLY CREDITED',
            'referral_code', v_reward.referral_code,
            'reward_amount', v_reward.reward_amount,
            'referrer_student_id', v_reward.referrer_student_id,
            'new_referral_balance', v_new_balance
        ),
        p_admin_email,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true, 
        'reward_id', p_reward_id, 
        'status', 'REFERRAL SUCCESSFULLY CREDITED',
        'credit_ledger_id', v_credit_ledger_id,
        'new_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_referral_reward FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_referral_reward TO service_role;

COMMIT;
