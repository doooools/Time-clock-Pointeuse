-- Pointages : un simple horodatage, l'entrée/sortie est déduite par le calcul.
CREATE TABLE punches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,                -- epoch ms UTC
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('webhook', 'manual', 'import')),
  note TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER                  -- suppression douce (permet l'annulation)
);
CREATE INDEX idx_punches_ts ON punches (ts) WHERE deleted_at IS NULL;

-- Marquage des jours d'absence ou de travail forcé.
CREATE TABLE day_marks (
  date TEXT PRIMARY KEY,              -- YYYY-MM-DD (heure de Paris)
  type TEXT NOT NULL CHECK (type IN ('conge', 'maladie', 'ferie', 'rtt', 'travail')),
  portion REAL NOT NULL DEFAULT 1,
  note TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
