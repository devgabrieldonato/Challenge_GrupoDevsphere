#pragma once

#include <chrono>
#include <mutex>
#include <string>
#include <unordered_map>

namespace devsphere {

std::string normalizeEmail(std::string email);
bool isValidEmail(const std::string& email);
std::string hashPassword(const std::string& password);
bool verifyPassword(const std::string& password, const std::string& encoded);
std::string randomToken(std::size_t byteCount = 32);
std::string sha256Hex(const std::string& value);
std::string jsonEscape(const std::string& value);

// Limite em memória adequado ao MVP de processo único. Em produção distribuída,
// este contrato deve ser movido para um armazenamento compartilhado.
class LoginRateLimiter {
 public:
  bool allow(const std::string& key);
  void success(const std::string& key);

 private:
  struct Bucket {
    int failures{};
    std::chrono::steady_clock::time_point windowStart{
        std::chrono::steady_clock::now()};
  };
  std::mutex mutex_;
  std::unordered_map<std::string, Bucket> buckets_;
};

}  // namespace devsphere
