-- Materialização idempotente e rastreabilidade de cada versão à fonte utilizada.
ALTER TABLE worker_jobs ADD COLUMN contribution_id INTEGER REFERENCES case_versions(id);
CREATE TABLE version_sources (
 version_id INTEGER NOT NULL REFERENCES case_versions(id),
 document_id TEXT NOT NULL REFERENCES source_documents(id),
 source_hash TEXT NOT NULL,
 markdown_hash TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(version_id,document_id)
);
CREATE TABLE case_exposures (
 user_id INTEGER NOT NULL REFERENCES users(id),
 case_version_id INTEGER NOT NULL REFERENCES case_versions(id),
 reason TEXT NOT NULL,
 recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,case_version_id)
);
-- O hash do upload é separado do documento oficial gerado pelo servidor.
ALTER TABLE submissions ADD COLUMN client_pdf_sha256 TEXT;
