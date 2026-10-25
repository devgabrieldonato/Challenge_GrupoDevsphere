-- Habilitação clínica explícita: administração técnica não implica competência docente.
CREATE TABLE reviewer_areas (
 user_id INTEGER NOT NULL REFERENCES users(id),
 area TEXT NOT NULL,
 enabled_by INTEGER NOT NULL REFERENCES users(id),
 enabled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,area)
);
CREATE TABLE case_review_assignments (
 version_id INTEGER PRIMARY KEY REFERENCES case_versions(id),
 reviewer_id INTEGER NOT NULL REFERENCES users(id),
 assigned_by INTEGER NOT NULL REFERENCES users(id),
 assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE curation_policy (
 singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),
 allow_self_approval INTEGER NOT NULL DEFAULT 0 CHECK(allow_self_approval IN (0,1))
);
INSERT INTO curation_policy(singleton_id) VALUES(1);
CREATE TABLE case_review_decisions (
 id INTEGER PRIMARY KEY,
 version_id INTEGER NOT NULL REFERENCES case_versions(id),
 reviewer_id INTEGER NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL,
 note TEXT NOT NULL,
 content_sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Registros imutáveis após revisão: revisões posteriores exigem nova versão.
CREATE TRIGGER freeze_approved_case_content BEFORE UPDATE OF content_json,metadata_json ON case_versions
 WHEN OLD.review_state IN ('approved','published') AND (NEW.content_json<>OLD.content_json OR NEW.metadata_json<>OLD.metadata_json)
 BEGIN SELECT RAISE(ABORT,'approved_version_is_immutable'); END;
