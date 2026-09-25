#include "security.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <iomanip>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <vector>

#include <argon2.h>

#ifdef DEVSPHERE_APPLE_CRYPTO
#include <CommonCrypto/CommonDigest.h>
#include <Security/SecRandom.h>
#else
#include <openssl/rand.h>
#include <openssl/sha.h>
#endif

namespace devsphere {
namespace {
constexpr std::uint32_t kArgonTimeCost = 3;
constexpr std::uint32_t kArgonMemoryKiB = 64 * 1024;
constexpr std::uint32_t kArgonParallelism = 1;
constexpr std::size_t kSaltBytes = 16;
constexpr std::size_t kHashBytes = 32;

std::string bytesToHex(const unsigned char* data, std::size_t size) {
  std::ostringstream out;
  out << std::hex << std::setfill('0');
  for (std::size_t i = 0; i < size; ++i) {
    out << std::setw(2) << static_cast<int>(data[i]);
  }
  return out.str();
}

std::vector<unsigned char> secureRandom(std::size_t count) {
  std::vector<unsigned char> bytes(count);
#ifdef DEVSPHERE_APPLE_CRYPTO
  if (SecRandomCopyBytes(kSecRandomDefault, bytes.size(), bytes.data()) !=
      errSecSuccess) {
    throw std::runtime_error("falha ao obter aleatoriedade segura");
  }
#else
  if (RAND_bytes(bytes.data(), static_cast<int>(bytes.size())) != 1) {
    throw std::runtime_error("falha ao obter aleatoriedade segura");
  }
#endif
  return bytes;
}
}  // namespace

std::string normalizeEmail(std::string email) {
  const auto notSpace = [](unsigned char value) { return !std::isspace(value); };
  email.erase(email.begin(), std::find_if(email.begin(), email.end(), notSpace));
  email.erase(std::find_if(email.rbegin(), email.rend(), notSpace).base(),
              email.end());
  std::transform(email.begin(), email.end(), email.begin(),
                 [](unsigned char value) { return std::tolower(value); });
  return email;
}

bool isValidEmail(const std::string& email) {
  static const std::regex pattern(
      R"(^[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$)");
  return email.size() <= 254 && std::regex_match(email, pattern);
}

std::string randomToken(std::size_t byteCount) {
  const auto bytes = secureRandom(byteCount);
  return bytesToHex(bytes.data(), bytes.size());
}

std::string hashPassword(const std::string& password) {
  if (password.size() < 12 || password.size() > 1024) {
    throw std::invalid_argument("a senha deve ter entre 12 e 1024 caracteres");
  }
  const auto salt = secureRandom(kSaltBytes);
  const std::size_t encodedLength = argon2_encodedlen(
      kArgonTimeCost, kArgonMemoryKiB, kArgonParallelism, salt.size(),
      kHashBytes, Argon2_id);
  std::vector<char> encoded(encodedLength);
  const int result = argon2id_hash_encoded(
      kArgonTimeCost, kArgonMemoryKiB, kArgonParallelism, password.data(),
      password.size(), salt.data(), salt.size(), kHashBytes, encoded.data(),
      encoded.size());
  if (result != ARGON2_OK) {
    throw std::runtime_error(argon2_error_message(result));
  }
  return encoded.data();
}

bool verifyPassword(const std::string& password, const std::string& encoded) {
  if (encoded.rfind("$argon2id$", 0) != 0) return false;
  return argon2id_verify(encoded.c_str(), password.data(), password.size()) ==
         ARGON2_OK;
}

std::string sha256Hex(const std::string& value) {
  std::array<unsigned char, 32> digest{};
#ifdef DEVSPHERE_APPLE_CRYPTO
  CC_SHA256(value.data(), static_cast<CC_LONG>(value.size()), digest.data());
#else
  SHA256(reinterpret_cast<const unsigned char*>(value.data()), value.size(),
         digest.data());
#endif
  return bytesToHex(digest.data(), digest.size());
}

std::string jsonEscape(const std::string& value) {
  std::ostringstream out;
  for (const unsigned char character : value) {
    switch (character) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\b': out << "\\b"; break;
      case '\f': out << "\\f"; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default:
        if (character < 0x20) {
          out << "\\u" << std::hex << std::setw(4) << std::setfill('0')
              << static_cast<int>(character);
        } else {
          out << character;
        }
    }
  }
  return out.str();
}

bool LoginRateLimiter::allow(const std::string& key) {
  std::lock_guard lock(mutex_);
  auto& bucket = buckets_[key];
  const auto now = std::chrono::steady_clock::now();
  if (now - bucket.windowStart > std::chrono::minutes(15)) {
    bucket = Bucket{};
  }
  if (bucket.failures >= 5) return false;
  ++bucket.failures;
  return true;
}

void LoginRateLimiter::success(const std::string& key) {
  std::lock_guard lock(mutex_);
  buckets_.erase(key);
}

}  // namespace devsphere
