PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'free' CHECK (mode IN ('free', 'paid')),
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO settings(id, mode) VALUES (1, 'free');
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS debates (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  issues TEXT NOT NULL,
  agree_label TEXT NOT NULL,
  disagree_label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS debates_created ON debates(created_at DESC, id);
CREATE INDEX IF NOT EXISTS debates_user ON debates(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS hearts (
  debate_id TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (debate_id, user_id)
);
CREATE INDEX IF NOT EXISTS hearts_user ON hearts(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS opinions (
  id TEXT PRIMARY KEY,
  debate_id TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('agree', 'disagree')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS opinions_debate ON opinions(debate_id, created_at, id);
CREATE INDEX IF NOT EXISTS opinions_user ON opinions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS votes (
  debate_id TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('agree', 'disagree')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (debate_id, user_id)
);
CREATE TABLE IF NOT EXISTS quotas (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS quotas_expiry ON quotas(expires_at);
