-- Heartbeat técnico sem conteúdo clínico. O migrador envolve cada arquivo em transação.
CREATE TABLE worker_runtime (
 instance_id TEXT PRIMARY KEY,
 started_at INTEGER NOT NULL,
 heartbeat_at INTEGER NOT NULL,
 config_json TEXT NOT NULL CHECK(json_valid(config_json)),
 config_hash TEXT NOT NULL
);
-- Recibo de remoção não preserva nome original, Markdown ou PDF. Uma limpeza
-- física incompleta permanece identificável após falha; não é sucesso silencioso.
CREATE TABLE source_purge_receipts (
 document_id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 institution_id TEXT NOT NULL,
 quarantine_name TEXT,
 cleanup_pending INTEGER NOT NULL DEFAULT 1 CHECK(cleanup_pending IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Revisão monotônica evita manter prévia válida após duas edições no mesmo
-- segundo; não expõe o Markdown nas listagens do catálogo de documentos.
ALTER TABLE source_documents ADD COLUMN extraction_revision INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER source_extraction_revision AFTER UPDATE OF markdown,pages_json ON source_documents
WHEN NEW.markdown<>OLD.markdown OR NEW.pages_json<>OLD.pages_json
BEGIN
 UPDATE source_documents SET extraction_revision=OLD.extraction_revision+1 WHERE id=NEW.id;
END;
