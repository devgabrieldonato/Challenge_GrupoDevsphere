-- Amplia o cadastro sem alterar os papéis acadêmicos já persistidos.
ALTER TABLE users ADD COLUMN registration_status TEXT NOT NULL DEFAULT 'active'
  CHECK(registration_status IN ('pending_admin', 'active', 'rejected'));
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN approved_by INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN approved_at TEXT;
ALTER TABLE users ADD COLUMN rejection_reason TEXT;

-- Uma conta administrativa continua vinculada a um usuário autenticável, mas
-- recebe o papel efetivo "admin" somente em consultas controladas pelo backend.
CREATE TABLE admin_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notification_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Somente endereços de domínios autorizados podem solicitar cadastro.
CREATE TABLE institutional_email_domains (
  id INTEGER PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A solicitação preserva o papel pedido e toda decisão administrativa.
CREATE TABLE registration_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL CHECK(requested_role IN ('student', 'teacher')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'rejected')),
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT
);

-- Nesta fase local, a fila é a evidência auditável da notificação. Um provedor
-- de e-mail poderá consumir os registros sem mudar o fluxo de aprovação.
CREATE TABLE email_outbox (
  id INTEGER PRIMARY KEY,
  recipient TEXT NOT NULL,
  template_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued', 'sent', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE INDEX idx_registration_status ON registration_requests(status, submitted_at);
CREATE INDEX idx_outbox_status ON email_outbox(status, created_at);
