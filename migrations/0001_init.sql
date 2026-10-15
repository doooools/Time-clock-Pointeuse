-- Opointeuse schema. Portable SQL: Cloudflare D1 and SQLite >= 3.35 (node:sqlite).
-- Foreign keys must be enabled on Node (PRAGMA foreign_keys = ON); D1 enables them by default.

-- Accounts. Managed with the CLI (`npm run user`) or the admin API; there is no admin page.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  password_hash TEXT NOT NULL,                -- format of server/passwords.ts
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  webhook_token TEXT NOT NULL UNIQUE,         -- punch webhook token, identifies the user
  settings TEXT NOT NULL DEFAULT '{}',        -- JSON Partial<Settings>, already sanitized
  session_version INTEGER NOT NULL DEFAULT 1, -- bumped to revoke every session of the user
  created_at INTEGER NOT NULL,                -- epoch ms
  disabled_at INTEGER                         -- epoch ms, NULL = active
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
