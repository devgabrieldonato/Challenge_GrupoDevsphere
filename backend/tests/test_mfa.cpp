#include "database.hpp"
#include "privileged_mfa.hpp"
#include "security.hpp"
#include <cassert>
#include <cstdlib>
#include <filesystem>
#include <iostream>

int main() {
  using namespace devsphere;
  // Vetor RFC 6238, SHA1, seis dígitos; não é segredo de conta real.
  const std::string secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert(PrivilegedMfa::totp(secret, 59) == "287082");
  auto path = (std::filesystem::temp_directory_path() /
               ("pv-mfa-" + randomToken(8) + ".db"))
                  .string();
  {
    Database db(path);
    db.migrate("migrations");
    db.createUser("Teste MFA", "mfa@example.test",
                  hashPassword("fixture-only-long-password"), "teacher");
    auto user = db.findUserByEmail("mfa@example.test");
    assert(user);
    auto name = "DEVSPHERE_MFA_SECRET_" + std::to_string(user->id);
    setenv(name.c_str(), secret.c_str(), 1);
    assert(PrivilegedMfa::verify(path, user->id, "287082", 59));
    assert(!PrivilegedMfa::verify(path, user->id, "287082", 59));
    assert(!PrivilegedMfa::verify(path, user->id, "000000", 59));
    auto recovery = "DEVSPHERE_MFA_RECOVERY_" + std::to_string(user->id);
    setenv(recovery.c_str(), sha256Hex("fixture-recovery-code").c_str(), 1);
    assert(PrivilegedMfa::verify(path, user->id, "fixture-recovery-code", 59));
    assert(!PrivilegedMfa::verify(path, user->id, "fixture-recovery-code", 59));
    auto token = sha256Hex(randomToken());
    db.createSession(user->id, token, "+8 hours");
    assert(!PrivilegedMfa::verifiedSession(path, token));
    PrivilegedMfa::markSession(path, token, user->id);
    assert(PrivilegedMfa::verifiedSession(path, token));
    db.deleteSession(token);
    assert(!PrivilegedMfa::verifiedSession(path, token));
    unsetenv(name.c_str());
    unsetenv(recovery.c_str());
  }
  std::filesystem::remove(path);
  std::cout << "MFA, replay, recuperação e revogação: OK\n";
}
