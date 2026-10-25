#pragma once
#include <cstdint>
#include <filesystem>
#include <sqlite3.h>
#include <stdexcept>
#include <string>

namespace devsphere {
// Erros públicos não incluem caminhos, IDs de terceiros ou configuração bruta.
struct StorageLimitError : std::runtime_error {
  int status;
  std::string code;
  StorageLimitError(int httpStatus, std::string errorCode, std::string message);
};
struct StorageLimits {
  std::uint64_t userBytes;
  std::uint64_t institutionBytes;
  std::uint64_t minFreeBytes;
};
struct StorageSnapshot {
  StorageLimits limits;
  std::uint64_t availableBytes{};
  std::uint64_t userUsedBytes{};
  std::uint64_t institutionUsedBytes{};
  std::uint64_t unknownSizes{};
};
// Diagnóstico somente de leitura; tamanhos desconhecidos nunca equivalem a zero.
StorageSnapshot storageSnapshot(sqlite3* db, std::int64_t userId,
                                const std::filesystem::path& root);
// Exige BEGIN IMMEDIATE do chamador. Mede legados íntegros nessa transação,
// verifica quotas e reserva em disco antes da criação do arquivo de upload.
void requireStorageAdmission(sqlite3* db, std::int64_t userId,
                             std::uint64_t incomingBytes,
                             const std::filesystem::path& root);
} // namespace devsphere
