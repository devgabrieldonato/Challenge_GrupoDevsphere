-- Fontes privadas e trabalhos persistentes. A fila não concede aprovação clínica.
CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  storage_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','converted','approved','withdrawn')),
  markdown TEXT NOT NULL DEFAULT '',
  pages_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(pages_json)),
  warnings_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(warnings_json)),
  authorized_use INTEGER NOT NULL DEFAULT 0 CHECK(authorized_use IN (0,1)),
  deidentified INTEGER NOT NULL DEFAULT 0 CHECK(deidentified IN (0,1)),
  approved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_source_documents_owner ON source_documents(owner_id,status);
CREATE TABLE IF NOT EXISTS document_grants (
  document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY(document_id,user_id)
);
CREATE TABLE IF NOT EXISTS worker_jobs (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  document_id TEXT NOT NULL REFERENCES source_documents(id),
  operation TEXT NOT NULL CHECK(operation IN ('convert','generate')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  request_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(request_json)),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error_json TEXT CHECK(error_json IS NULL OR json_valid(error_json)),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2 CHECK(max_attempts BETWEEN 1 AND 3),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER,
  expires_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)+86400),
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_worker_claim ON worker_jobs(status,next_attempt_at,created_at);
-- Busca textual não treina modelos. Permissão deve ser filtrada antes de retornar trechos.
CREATE TABLE IF NOT EXISTS library_chunks (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_document ON library_chunks(document_id,page);
CREATE VIRTUAL TABLE IF NOT EXISTS library_chunks_fts USING fts5(text,content='library_chunks',content_rowid='id');
CREATE TRIGGER IF NOT EXISTS library_chunks_insert AFTER INSERT ON library_chunks BEGIN
  INSERT INTO library_chunks_fts(rowid,text) VALUES(new.id,new.text);
END;
CREATE TRIGGER IF NOT EXISTS library_chunks_delete AFTER DELETE ON library_chunks BEGIN
  INSERT INTO library_chunks_fts(library_chunks_fts,rowid,text) VALUES('delete',old.id,old.text);
END;
CREATE TRIGGER IF NOT EXISTS library_chunks_update AFTER UPDATE ON library_chunks BEGIN
  INSERT INTO library_chunks_fts(library_chunks_fts,rowid,text) VALUES('delete',old.id,old.text);
  INSERT INTO library_chunks_fts(rowid,text) VALUES(new.id,new.text);
END;
