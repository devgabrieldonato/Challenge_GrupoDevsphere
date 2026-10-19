-- Não persiste sementes TOTP. O segredo individual é provisionado fora do Git.
CREATE TABLE privileged_mfa_counters (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_counter INTEGER NOT NULL
);
CREATE TABLE consumed_recovery_codes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest TEXT NOT NULL,
  consumed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,digest)
);
CREATE TABLE mfa_verified_sessions (
  token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
