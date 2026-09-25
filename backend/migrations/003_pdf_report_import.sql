-- Acrescenta a proveniência dos relatórios importados sem alterar submissões existentes.
ALTER TABLE submissions
  ADD COLUMN imported_by INTEGER REFERENCES users(id);

ALTER TABLE submissions
  ADD COLUMN source_document_id INTEGER REFERENCES uploaded_documents(id);

ALTER TABLE submissions
  ADD COLUMN raw_report_json TEXT
    CHECK(raw_report_json IS NULL OR json_valid(raw_report_json));

CREATE INDEX IF NOT EXISTS idx_submissions_imported_by
  ON submissions(imported_by);

