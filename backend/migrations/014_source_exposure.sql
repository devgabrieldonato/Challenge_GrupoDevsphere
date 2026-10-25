-- Consulta de uma fonte também revela conteúdo antes de existir um caso derivado.
CREATE TABLE source_readers (
 document_id TEXT NOT NULL REFERENCES source_documents(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(document_id,user_id)
);
