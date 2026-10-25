-- Organização pessoal da lista, sem apagar resultado, fonte, auditoria ou vínculos.
-- O migrador aplica o ALTER em transação e cria backup consistente da base.
ALTER TABLE worker_jobs ADD COLUMN archived_at TEXT;
CREATE INDEX idx_worker_jobs_owner_archive ON worker_jobs(owner_id,archived_at,created_at);
