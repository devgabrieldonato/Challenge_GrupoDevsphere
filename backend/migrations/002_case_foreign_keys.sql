-- Mantém a versão atual como referência lógica. O SQLite não permite adicionar
-- a chave estrangeira após a criação sem reconstruir a tabela; a aplicação
-- valida que current_version_id pertence ao mesmo caso antes de publicar.
CREATE INDEX IF NOT EXISTS idx_case_versions_case
  ON case_versions(clinical_case_id, version_number);
CREATE INDEX IF NOT EXISTS idx_cases_status ON clinical_cases(status);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON ai_generation_jobs(status);
