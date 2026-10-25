-- A área encaminha curadoria; disciplina não é obrigatória para uma fonte.
ALTER TABLE source_documents ADD COLUMN area TEXT NOT NULL DEFAULT 'general';
