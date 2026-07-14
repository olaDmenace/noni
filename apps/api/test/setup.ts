// Populated before env.ts runs its Zod validation at import time.
process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3000';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/noni_test';
process.env.REDIS_URL ??= 'redis://localhost:6379/1';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-32-characters-long';
process.env.OTP_SALT ??= 'test-otp-salt';
process.env.PHONE_HASH_SALT ??= 'test-phone-hash-salt';
process.env.PAYSTACK_SECRET_KEY ??= 'sk_test_placeholder';
process.env.PAYSTACK_WEBHOOK_SECRET ??= 'whsec_test_placeholder';
process.env.ANTHROPIC_API_KEY ??= 'sk-ant-test-placeholder';
process.env.TERMII_API_KEY ??= 'termii_test_placeholder';
process.env.FCM_PROJECT_ID ??= 'noni-test';
process.env.LOG_LEVEL ??= 'fatal';
