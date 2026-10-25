-- Instância local inicial; identificadores institucionais só são configurados
-- por administração do servidor, nunca por payload acadêmico do navegador.
ALTER TABLE users ADD COLUMN institution_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE clinical_cases ADD COLUMN institution_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE classes ADD COLUMN institution_id TEXT NOT NULL DEFAULT 'local';
CREATE INDEX idx_users_institution ON users(institution_id);
CREATE INDEX idx_cases_institution ON clinical_cases(institution_id,status);
CREATE TRIGGER review_assignment_same_institution BEFORE INSERT ON case_review_assignments
 WHEN (SELECT institution_id FROM users WHERE id=NEW.reviewer_id)<>
      (SELECT c.institution_id FROM clinical_cases c JOIN case_versions v ON v.clinical_case_id=c.id WHERE v.id=NEW.version_id)
 BEGIN SELECT RAISE(ABORT,'reviewer_institution_mismatch'); END;
CREATE TRIGGER review_assignment_update_institution BEFORE UPDATE OF reviewer_id ON case_review_assignments
 WHEN (SELECT institution_id FROM users WHERE id=NEW.reviewer_id)<>
      (SELECT c.institution_id FROM clinical_cases c JOIN case_versions v ON v.clinical_case_id=c.id WHERE v.id=NEW.version_id)
 BEGIN SELECT RAISE(ABORT,'reviewer_institution_mismatch'); END;
