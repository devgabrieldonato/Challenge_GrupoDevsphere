-- Conteúdo restrito versionado e tentativas cujo histórico é aceito pelo servidor.
ALTER TABLE case_versions ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json));
ALTER TABLE case_versions ADD COLUMN review_state TEXT NOT NULL DEFAULT 'draft'
 CHECK(review_state IN ('draft','awaiting_review','in_review','changes_requested','approved','published','rejected','archived'));
ALTER TABLE case_versions ADD COLUMN reviewed_by INTEGER REFERENCES users(id);
ALTER TABLE case_versions ADD COLUMN reviewed_at TEXT;
ALTER TABLE case_versions ADD COLUMN content_sha256 TEXT;
CREATE TABLE clinical_sessions (
 id INTEGER PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 case_version_id INTEGER NOT NULL REFERENCES case_versions(id),
 activity_id INTEGER REFERENCES activities(id),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
 raw_score INTEGER NOT NULL DEFAULT 50,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 submission_id INTEGER UNIQUE REFERENCES submissions(id)
);
CREATE TABLE clinical_actions (
 id INTEGER PRIMARY KEY,
 session_id INTEGER NOT NULL REFERENCES clinical_sessions(id),
 sequence_number INTEGER NOT NULL,
 item_key TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 score_delta INTEGER NOT NULL,
 raw_after INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(session_id,sequence_number), UNIQUE(session_id,item_key)
);
CREATE TABLE clinical_hypotheses (
 id INTEGER PRIMARY KEY,
 session_id INTEGER NOT NULL REFERENCES clinical_sessions(id),
 hypothesis TEXT NOT NULL,
 justification TEXT NOT NULL,
 is_correct INTEGER NOT NULL CHECK(is_correct IN(0,1)),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_notifications (
 id INTEGER PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL,
 message TEXT NOT NULL,
 submission_id INTEGER REFERENCES submissions(id),
 feedback_id INTEGER UNIQUE REFERENCES teacher_feedback(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 read_at TEXT
);
CREATE TRIGGER notify_completed_feedback AFTER UPDATE OF status ON teacher_feedback
 WHEN NEW.status='completed' AND OLD.status='draft'
 BEGIN
 INSERT OR IGNORE INTO user_notifications(user_id,kind,message,submission_id,feedback_id)
 SELECT student_id,'feedback.completed','Uma nova devolutiva docente está disponível.',NEW.submission_id,NEW.id
 FROM submissions WHERE id=NEW.submission_id;
 END;
CREATE INDEX idx_clinical_sessions_user ON clinical_sessions(user_id,created_at);
CREATE INDEX idx_notifications_owner ON user_notifications(user_id,read_at);
