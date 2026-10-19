#include "privileged_mfa.hpp"
#include "security.hpp"
#include <array>
#include <cstdlib>
#include <iomanip>
#include <sqlite3.h>
#include <sstream>
#include <stdexcept>
#include <vector>
#ifdef DEVSPHERE_APPLE_CRYPTO
#include <CommonCrypto/CommonHMAC.h>
#else
#include <openssl/hmac.h>
#endif

namespace devsphere {
namespace {
// A semente de cada conta é externa ao banco, para não acompanhar cópias
// SQLite.
std::string setting(const char *prefix, std::int64_t id) {
  const auto name = std::string(prefix) + std::to_string(id);
  const char *value = std::getenv(name.c_str());
  return value ? value : "";
}
std::vector<unsigned char> decode(const std::string &input) {
  std::vector<unsigned char> bytes;
  unsigned int buffer = 0;
  int bits = 0;
  for (char c : input) {
    const std::string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    auto at = alphabet.find(c);
    if (at == std::string::npos)
      throw std::invalid_argument("Semente TOTP inválida.");
    buffer = (buffer << 5) | static_cast<unsigned int>(at);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push_back(static_cast<unsigned char>(buffer >> bits));
    }
  }
  if (bytes.size() < 20)
    throw std::invalid_argument("Semente TOTP insuficiente.");
  return bytes;
}
bool equal(const std::string &a, const std::string &b) {
  unsigned int diff = static_cast<unsigned int>(a.size() ^ b.size());
  for (std::size_t i = 0; i < a.size() && i < b.size(); ++i)
    diff |= a[i] ^ b[i];
  return diff == 0;
}
class Connection {
public:
  sqlite3 *db{};
  explicit Connection(const std::string &path) {
    if (sqlite3_open_v2(path.c_str(), &db, SQLITE_OPEN_READWRITE, nullptr) !=
        SQLITE_OK)
      throw std::runtime_error("Banco MFA indisponível.");
    sqlite3_busy_timeout(db, 5000);
    sqlite3_exec(db, "PRAGMA foreign_keys=ON", nullptr, nullptr, nullptr);
  }
  ~Connection() {
    if (db)
      sqlite3_close(db);
  }
};
class Query {
public:
  sqlite3_stmt *s{};
  Query(sqlite3 *db, const char *sql) {
    if (sqlite3_prepare_v2(db, sql, -1, &s, nullptr) != SQLITE_OK)
      throw std::runtime_error("Consulta MFA inválida.");
  }
  ~Query() { sqlite3_finalize(s); }
};
} // namespace

std::string PrivilegedMfa::totp(const std::string &secret,
                                std::int64_t unixTime) {
  if (unixTime < 0)
    return "";
  const auto key = decode(secret);
  std::uint64_t counter = static_cast<std::uint64_t>(unixTime / 30);
  std::array<unsigned char, 8> message{};
  for (int i = 7; i >= 0; --i) {
    message[i] = counter & 255;
    counter >>= 8;
  }
  std::array<unsigned char, 20> digest{};
#ifdef DEVSPHERE_APPLE_CRYPTO
  CCHmac(kCCHmacAlgSHA1, key.data(), key.size(), message.data(), message.size(),
         digest.data());
#else
  unsigned int length = 20;
  HMAC(EVP_sha1(), key.data(), static_cast<int>(key.size()), message.data(),
       message.size(), digest.data(), &length);
#endif
  const int offset = digest[19] & 15;
  const auto value = ((digest[offset] & 127u) << 24) |
                     (digest[offset + 1] << 16) | (digest[offset + 2] << 8) |
                     digest[offset + 3];
  std::ostringstream out;
  out << std::setw(6) << std::setfill('0') << (value % 1000000);
  return out.str();
}

bool PrivilegedMfa::configured(std::int64_t id) {
  try {
    return decode(setting("DEVSPHERE_MFA_SECRET_", id)).size() >= 20;
  } catch (...) {
    return false;
  }
}

bool PrivilegedMfa::verify(const std::string &path, std::int64_t id,
                           const std::string &code, std::int64_t now) {
  if (!configured(id) || code.empty() || code.size() > 128)
    return false;
  Connection conn(path);
  // INSERT/UPSERT condicional torna a proteção de replay atômica entre
  // processos.
  if (code.size() == 6 &&
      code.find_first_not_of("0123456789") == std::string::npos) {
    const auto secret = setting("DEVSPHERE_MFA_SECRET_", id);
    for (int delta = -1; delta <= 1; ++delta) {
      const auto time = now + delta * 30;
      if (time >= 0 && equal(totp(secret, time), code)) {
        Query q(conn.db,
                "INSERT INTO privileged_mfa_counters(user_id,last_counter) "
                "VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET "
                "last_counter=excluded.last_counter WHERE "
                "last_counter<excluded.last_counter");
        sqlite3_bind_int64(q.s, 1, id);
        sqlite3_bind_int64(q.s, 2, time / 30);
        return sqlite3_step(q.s) == SQLITE_DONE &&
               sqlite3_changes(conn.db) == 1;
      }
    }
    return false;
  }
  // Códigos de recuperação têm alta entropia; o ambiente contém apenas hashes.
  const auto digest = sha256Hex(code);
  std::stringstream allowed(setting("DEVSPHERE_MFA_RECOVERY_", id));
  std::string candidate;
  while (std::getline(allowed, candidate, ',')) {
    if (equal(candidate, digest)) {
      Query q(conn.db, "INSERT OR IGNORE INTO "
                       "consumed_recovery_codes(user_id,digest) VALUES(?,?)");
      sqlite3_bind_int64(q.s, 1, id);
      sqlite3_bind_text(q.s, 2, digest.c_str(), -1, SQLITE_TRANSIENT);
      return sqlite3_step(q.s) == SQLITE_DONE && sqlite3_changes(conn.db) == 1;
    }
  }
  return false;
}
void PrivilegedMfa::markSession(const std::string &path,
                                const std::string &hash, std::int64_t id) {
  Connection conn(path);
  Query q(conn.db,
          "INSERT INTO mfa_verified_sessions(token_hash,user_id) VALUES(?,?)");
  sqlite3_bind_text(q.s, 1, hash.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int64(q.s, 2, id);
  if (sqlite3_step(q.s) != SQLITE_DONE)
    throw std::runtime_error("Falha ao registrar sessão MFA.");
}
bool PrivilegedMfa::verifiedSession(const std::string &path,
                                    const std::string &hash) {
  Connection conn(path);
  Query q(conn.db, "SELECT 1 FROM mfa_verified_sessions m JOIN sessions s ON "
                   "s.token_hash=m.token_hash WHERE m.token_hash=? AND "
                   "s.expires_at>CURRENT_TIMESTAMP");
  sqlite3_bind_text(q.s, 1, hash.c_str(), -1, SQLITE_TRANSIENT);
  return sqlite3_step(q.s) == SQLITE_ROW;
}
} // namespace devsphere
