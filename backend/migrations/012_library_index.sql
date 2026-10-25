-- Cursor de reindexação: muda quando o Markdown revisável ou estado muda.
CREATE TABLE IF NOT EXISTS library_index_state (
  document_id TEXT PRIMARY KEY REFERENCES source_documents(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL
);
