-- Per-account brute-force protection on password checks (login, password change).
-- After LOGIN_MAX_FAILURES consecutive failures the account is locked for LOGIN_LOCK_MS (server/users.ts):
-- password checks answer 429 until locked_until. Existing sessions and the webhook are not affected.
ALTER TABLE users ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0; -- consecutive failures since the last success or lock
ALTER TABLE users ADD COLUMN locked_until INTEGER;                     -- epoch ms, NULL = not locked
