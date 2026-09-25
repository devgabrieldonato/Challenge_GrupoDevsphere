PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL CHECK(length(trim(full_name)) > 0),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student', 'teacher')),
  class_name TEXT,
  professional_registration TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_enrollments (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(class_id, student_id)
);

CREATE TABLE IF NOT EXISTS clinical_cases (
  id INTEGER PRIMARY KEY,
  stable_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft', 'review', 'published', 'archived')),
  author_id INTEGER REFERENCES users(id),
  current_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_versions (
  id INTEGER PRIMARY KEY,
  clinical_case_id INTEGER NOT NULL REFERENCES clinical_cases(id),
  version_number INTEGER NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  source_document_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(clinical_case_id, version_number)
);

CREATE TABLE IF NOT EXISTS case_items (
  id INTEGER PRIMARY KEY,
  case_version_id INTEGER NOT NULL REFERENCES case_versions(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('question', 'exam')),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  answer TEXT NOT NULL,
  pedagogical_classification TEXT,
  pedagogical_comment TEXT,
  dependencies_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(dependencies_json)),
  UNIQUE(case_version_id, stable_key)
);

CREATE TABLE IF NOT EXISTS case_hypotheses (
  id INTEGER PRIMARY KEY,
  case_version_id INTEGER NOT NULL REFERENCES case_versions(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_expected INTEGER NOT NULL DEFAULT 0 CHECK(is_expected IN (0, 1)),
  position INTEGER NOT NULL,
  UNIQUE(case_version_id, stable_key)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  case_version_id INTEGER NOT NULL REFERENCES case_versions(id),
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  class_id INTEGER REFERENCES classes(id),
  opens_at TEXT,
  closes_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_assignments (
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(activity_id, student_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  activity_id INTEGER REFERENCES activities(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  case_version_id INTEGER REFERENCES case_versions(id),
  source TEXT NOT NULL DEFAULT 'platform'
    CHECK(source IN ('platform', 'pdf_import')),
  source_pdf_path TEXT,
  report_schema_version TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submission_steps (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
  sequence_number INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('question', 'exam')),
  title TEXT NOT NULL,
  response TEXT NOT NULL,
  pedagogical_classification TEXT,
  pedagogical_comment TEXT,
  dependencies_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(dependencies_json)),
  recorded_at TEXT,
  UNIQUE(submission_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS diagnostic_attempts (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL,
  hypothesis_key TEXT NOT NULL,
  hypothesis_label TEXT NOT NULL,
  justification TEXT NOT NULL,
  comparison_result TEXT,
  evidence_snapshot_json TEXT NOT NULL CHECK(json_valid(evidence_snapshot_json)),
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS teacher_feedback (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id),
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  strengths TEXT NOT NULL DEFAULT '',
  difficulties TEXT NOT NULL DEFAULT '',
  missed_evidence TEXT NOT NULL DEFAULT '',
  prioritization_comment TEXT NOT NULL DEFAULT '',
  justification_comment TEXT NOT NULL DEFAULT '',
  next_attempt_guidance TEXT NOT NULL DEFAULT '',
  general_observation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft', 'completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS uploaded_documents (
  id INTEGER PRIMARY KEY,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  markdown_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  id INTEGER PRIMARY KEY,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'needs_review', 'failed', 'completed')),
  prompt_version TEXT,
  model_name TEXT,
  source_document_id INTEGER REFERENCES uploaded_documents(id),
  structured_input_json TEXT CHECK(structured_input_json IS NULL OR json_valid(structured_input_json)),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  warnings_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(warnings_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiration ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_activity ON submissions(activity_id);
CREATE INDEX IF NOT EXISTS idx_feedback_teacher ON teacher_feedback(teacher_id);
CREATE INDEX IF NOT EXISTS idx_steps_submission_sequence
  ON submission_steps(submission_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_attempts_submission_number
  ON diagnostic_attempts(submission_id, attempt_number);

CREATE TRIGGER IF NOT EXISTS submissions_immutable_update
BEFORE UPDATE ON submissions BEGIN
  SELECT RAISE(ABORT, 'submissions são imutáveis');
END;

CREATE TRIGGER IF NOT EXISTS submission_steps_immutable_update
BEFORE UPDATE ON submission_steps BEGIN
  SELECT RAISE(ABORT, 'etapas enviadas são imutáveis');
END;

CREATE TRIGGER IF NOT EXISTS diagnostic_attempts_immutable_update
BEFORE UPDATE ON diagnostic_attempts BEGIN
  SELECT RAISE(ABORT, 'tentativas enviadas são imutáveis');
END;
