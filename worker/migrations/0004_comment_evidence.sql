ALTER TABLE opinions ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE evidence_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX evidence_sources_user ON evidence_sources(user_id,created_at);
CREATE TABLE evidence_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  phase TEXT NOT NULL,
  result TEXT,
  error_code TEXT,
  error_message TEXT,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(user_id,cache_key)
);
CREATE INDEX evidence_jobs_expiry ON evidence_jobs(expires_at);
