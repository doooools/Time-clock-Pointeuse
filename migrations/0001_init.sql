-- Time clock schema. Portable SQL: Cloudflare D1 and SQLite >= 3.35 (node:sqlite).
-- Foreign keys must be enabled on Node (PRAGMA foreign_keys = ON); D1 enables them by default.

-- Accounts. Managed with the CLI (`npm run user`) or the admin API.
-- Roles: owner (everything, including managing owners and admins), admin (manages `user` accounts and
-- their hours), user (own data; the perm_* columns grant more). Capabilities are computed in server/users.ts.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  password_hash TEXT NOT NULL,                -- format of server/passwords.ts
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
  perm_edit_own INTEGER NOT NULL DEFAULT 1,   -- may add / change / delete own punches and day marks
  perm_view_presence INTEGER NOT NULL DEFAULT 0, -- sees the team presence board
  perm_view_team INTEGER NOT NULL DEFAULT 0,  -- reads the hours of the other accounts (read only)
  webhook_token TEXT NOT NULL UNIQUE,         -- punch webhook token, identifies the user
  settings TEXT NOT NULL DEFAULT '{}',        -- JSON Partial<Settings>, already sanitized
  session_version INTEGER NOT NULL DEFAULT 1, -- bumped to revoke every session of the user
  created_at INTEGER NOT NULL,                -- epoch ms
  disabled_at INTEGER,                        -- epoch ms, NULL = active
  -- Per-account brute-force protection on password checks (login, password change). After
  -- LOGIN_MAX_FAILURES consecutive failures the account is locked for LOGIN_LOCK_MS (server/users.ts):
  -- password checks answer 429 until locked_until. Existing sessions and the webhook are not affected.
  failed_logins INTEGER NOT NULL DEFAULT 0,   -- consecutive failures since the last success or lock
  locked_until INTEGER                        -- epoch ms, NULL = not locked
);

-- Punches: a bare timestamp; in/out is derived by the computation engine.
CREATE TABLE punches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,                        -- epoch ms UTC
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('webhook', 'manual', 'import')),
  note TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER                          -- soft delete (allows undo)
);
CREATE INDEX idx_punches_user_ts ON punches (user_id, ts) WHERE deleted_at IS NULL;

-- Day marks: absences, or forced workdays.
CREATE TABLE day_marks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                         -- YYYY-MM-DD in the user's time zone
  type TEXT NOT NULL CHECK (type IN ('leave', 'sick', 'holiday', 'comp_time', 'workday')),
  portion REAL NOT NULL DEFAULT 1,            -- 1 = full day, 0.5 = half day
  half TEXT CHECK (half IN ('am', 'pm')),     -- which half when portion < 1 (NULL = unspecified / full day)
  note TEXT,
  PRIMARY KEY (user_id, date)
);

-- Change log: every manual change to punches and day marks, imports and account administration
-- (server/audit.ts). Webhook punches and a user's own settings are not logged.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,                                           -- epoch ms
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,      -- NULL = CLI (or deleted account)
  -- Account whose data changed. NULL only for "user.delete" (the account is gone; target = its former id,
  -- before = its username, display name and role). Other entries of a deleted account go with it.
  subject_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                                          -- AuditAction of server/audit.ts
  target TEXT,                                                   -- punch id, YYYY-MM-DD date…
  before TEXT,                                                   -- JSON or NULL
  after TEXT,                                                    -- JSON or NULL
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'cli'))
);
CREATE INDEX idx_audit_subject ON audit_log (subject_id, id);

-- Persistent notifications about logged changes, closed by hand by their recipient.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- recipient
  audit_id INTEGER NOT NULL REFERENCES audit_log(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  dismissed_at INTEGER
);
CREATE INDEX idx_notifications_open ON notifications (user_id, id) WHERE dismissed_at IS NULL;
