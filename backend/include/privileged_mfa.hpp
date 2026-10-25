#pragma once

#include <cstdint>
#include <string>

namespace devsphere {
// Segundo fator de contas privilegiadas. Segredos vêm do ambiente operacional,
// enquanto o SQLite registra somente replay, recuperação consumida e sessões.
class PrivilegedMfa {
public:
  static bool configured(std::int64_t userId);
  static bool verify(const std::string &databasePath, std::int64_t userId,
                     const std::string &code, std::int64_t unixTime);
  static void markSession(const std::string &databasePath,
                          const std::string &tokenHash, std::int64_t userId);
  static bool verifiedSession(const std::string &databasePath,
                              const std::string &tokenHash);
  static std::string totp(const std::string &base32Secret,
                          std::int64_t unixTime);
};
} // namespace devsphere
