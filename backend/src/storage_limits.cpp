#include "storage_limits.hpp"
#include "security.hpp"
#include <charconv>
#include <cstdlib>
#include <fcntl.h>
#include <limits>
#include <memory>
#include <regex>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <unistd.h>
#include <vector>

namespace devsphere {
StorageLimitError::StorageLimitError(int s, std::string c, std::string m)
    : std::runtime_error(std::move(m)), status(s), code(std::move(c)) {}
namespace {
constexpr std::uint64_t MiB = 1024 * 1024;
constexpr std::uint64_t maxPdfBytes = 10 * MiB;
constexpr std::uint64_t maxConfiguredBytes = 1024ULL * 1024 * MiB;
constexpr int maxInstitutionDocuments = 10000;
constexpr std::size_t maxLegacyRecords = 128;
constexpr std::uint64_t maxLegacyHashBytes = 64 * MiB;
[[noreturn]] void unavailable() {
  throw StorageLimitError(503, "storage_unavailable", "Armazenamento indisponível para conferência segura.");
}
[[noreturn]] void accountingRequired() {
  throw StorageLimitError(503, "storage_accounting_required", "Uma fonte existente exige reconciliação antes de novos envios.");
}
// Aceita somente inteiros decimais positivos com teto finito. Erro não libera quota.
std::uint64_t configured(const char* name, std::uint64_t fallback) {
  const char* env = std::getenv(name);
  if (!env) return fallback;
  const std::string raw(env);
  std::uint64_t result{};
  const auto parsed = std::from_chars(raw.data(), raw.data() + raw.size(), result);
  if (raw.empty() || raw.size() > 16 || raw.find_first_not_of("0123456789") != std::string::npos ||
      parsed.ec != std::errc{} || parsed.ptr != raw.data() + raw.size() || !result || result > maxConfiguredBytes)
    throw StorageLimitError(503, "invalid_storage_configuration", "Configuração de armazenamento inválida.");
  return result;
}
StorageLimits limits() {
  return {configured("DEVSPHERE_STORAGE_USER_BYTES", 200 * MiB),
          configured("DEVSPHERE_STORAGE_INSTITUTION_BYTES", 1024 * MiB),
          configured("DEVSPHERE_STORAGE_MIN_FREE_BYTES", 512 * MiB)};
}
struct Fd {
  int value{-1};
  explicit Fd(int v) : value(v) {}
  ~Fd() { if(value >= 0) close(value); }
  Fd(const Fd&) = delete;
  Fd& operator=(const Fd&) = delete;
};
using Statement = std::unique_ptr<sqlite3_stmt, decltype(&sqlite3_finalize)>;
Statement prepare(sqlite3* db, const char* sql) {
  sqlite3_stmt* stmt{};
  if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) unavailable();
  return Statement(stmt, sqlite3_finalize);
}
void bind(sqlite3_stmt* stmt, int index, std::int64_t value) {
  if (sqlite3_bind_int64(stmt, index, value) != SQLITE_OK) unavailable();
}
std::string column(sqlite3_stmt* stmt, int index) {
  const auto* text = sqlite3_column_text(stmt, index);
  return text ? reinterpret_cast<const char*>(text) : "";
}
// Percorre cada componente sem seguir links; caminho relativo usa a raiz absoluta.
// O descritor final fixa o diretório real durante a conferência e o statvfs.
std::filesystem::path normalizedRoot(const std::filesystem::path& root) {
  auto absolute = std::filesystem::absolute(root).lexically_normal();
#ifdef __APPLE__
  // /var e /tmp são aliases do próprio sistema macOS; o restante não aceita links.
  const auto raw = absolute.string();
  if (raw.starts_with("/var/") || raw == "/var" || raw.starts_with("/tmp/") || raw == "/tmp")
    absolute = std::filesystem::path("/private" + raw);
#endif
  return absolute;
}
int openRoot(const std::filesystem::path& root) {
  const auto absolute = normalizedRoot(root);
  int fd = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (fd < 0) unavailable();
  for (const auto& component : absolute.relative_path()) {
    const int next = openat(fd, component.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    close(fd);
    if (next < 0) unavailable();
    fd = next;
  }
  return fd;
}
std::uint64_t available(int rootFd) {
  struct statvfs fs{};
  if (fstatvfs(rootFd, &fs) != 0 || !fs.f_frsize ||
      static_cast<std::uint64_t>(fs.f_bavail) > std::numeric_limits<std::uint64_t>::max() / fs.f_frsize)
    unavailable();
  return static_cast<std::uint64_t>(fs.f_bavail) * fs.f_frsize;
}
void requireActor(sqlite3* db, std::int64_t userId) {
  auto q = prepare(db, "SELECT institution_id FROM users WHERE id=?");
  bind(q.get(), 1, userId);
  if (sqlite3_step(q.get()) != SQLITE_ROW || column(q.get(), 0).empty()) unavailable();
}
StorageSnapshot snapshot(sqlite3* db, std::int64_t userId, int rootFd, StorageLimits configuredLimits) {
  StorageSnapshot result{configuredLimits};
  result.availableBytes = available(rootFd);
  auto q = prepare(db,
    "SELECT COALESCE(SUM(CASE WHEN d.owner_id=? THEN d.byte_size ELSE 0 END),0),"
    "COALESCE(SUM(d.byte_size),0),COALESCE(SUM(d.byte_size IS NULL),0),COUNT(*) "
    "FROM source_documents d JOIN users u ON u.id=d.owner_id "
    "WHERE u.institution_id=(SELECT institution_id FROM users WHERE id=?)");
  bind(q.get(), 1, userId); bind(q.get(), 2, userId);
  if (sqlite3_step(q.get()) != SQLITE_ROW) unavailable();
  if (sqlite3_column_int64(q.get(), 3) > maxInstitutionDocuments) accountingRequired();
  for (int i=0; i<3; ++i) if (sqlite3_column_int64(q.get(), i) < 0) unavailable();
  result.userUsedBytes = sqlite3_column_int64(q.get(), 0);
  result.institutionUsedBytes = sqlite3_column_int64(q.get(), 1);
  result.unknownSizes = sqlite3_column_int64(q.get(), 2);
  return result;
}
// Confere somente legados da instituição do ator; não varre outras instituições.
// O hash protege contra registrar um PDF diferente no lugar da fonte histórica.
void reconcileUnknown(sqlite3* db, std::int64_t userId, int rootFd, const std::filesystem::path& root) {
  struct Legacy { std::string id, path, hash; };
  std::vector<Legacy> records;
  auto q = prepare(db,
    "SELECT d.id,d.storage_path,d.sha256 FROM source_documents d JOIN users u ON u.id=d.owner_id "
    "WHERE u.institution_id=(SELECT institution_id FROM users WHERE id=?) AND d.byte_size IS NULL LIMIT 10001");
  bind(q.get(), 1, userId);
  int status;
  while ((status=sqlite3_step(q.get())) == SQLITE_ROW) {
    records.push_back({column(q.get(),0),column(q.get(),1),column(q.get(),2)});
    if (records.size() > maxLegacyRecords) accountingRequired();
  }
  if (status != SQLITE_DONE) unavailable();
  const auto absoluteRoot = normalizedRoot(root);
  std::uint64_t bytesChecked{};
  for (const auto& record : records) {
    if (!std::regex_match(record.id, std::regex("[a-f0-9]{32}")) ||
        !std::regex_match(record.hash, std::regex("[a-f0-9]{64}"))) accountingRequired();
    const auto filename = record.id + ".pdf";
    if (normalizedRoot(record.path) != absoluteRoot / filename) accountingRequired();
    Fd file(openat(rootFd, filename.c_str(), O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK));
    struct stat before{}, after{};
    if (file.value < 0 || fstat(file.value,&before) || !S_ISREG(before.st_mode) || before.st_nlink != 1 ||
        before.st_size <= 0 || static_cast<std::uint64_t>(before.st_size) > maxPdfBytes) accountingRequired();
    if (static_cast<std::uint64_t>(before.st_size) > maxLegacyHashBytes-bytesChecked) accountingRequired();
    bytesChecked += static_cast<std::uint64_t>(before.st_size);
    std::string bytes(static_cast<std::size_t>(before.st_size), '\0');
    std::size_t offset{};
    while (offset < bytes.size()) {
      const auto count = read(file.value, bytes.data()+offset, bytes.size()-offset);
      if (count <= 0) accountingRequired();
      offset += static_cast<std::size_t>(count);
    }
    char extra;
    struct stat named{};
    if (read(file.value,&extra,1) != 0 || fstat(file.value,&after) ||
        before.st_size != after.st_size || before.st_mtime != after.st_mtime || before.st_ctime != after.st_ctime ||
        before.st_dev != after.st_dev || before.st_ino != after.st_ino || after.st_nlink != 1 ||
        fstatat(rootFd, filename.c_str(), &named, AT_SYMLINK_NOFOLLOW) || !S_ISREG(named.st_mode) ||
        named.st_dev != after.st_dev || named.st_ino != after.st_ino || named.st_nlink != 1 ||
#ifdef __APPLE__
        before.st_mtimespec.tv_nsec != after.st_mtimespec.tv_nsec || before.st_ctimespec.tv_nsec != after.st_ctimespec.tv_nsec ||
#else
        before.st_mtim.tv_nsec != after.st_mtim.tv_nsec || before.st_ctim.tv_nsec != after.st_ctim.tv_nsec ||
#endif
        sha256Hex(bytes) != record.hash)
      accountingRequired();
    auto update = prepare(db,"UPDATE source_documents SET byte_size=? WHERE id=? AND byte_size IS NULL");
    bind(update.get(),1,static_cast<std::int64_t>(bytes.size()));
    if (sqlite3_bind_text(update.get(),2,record.id.c_str(),-1,SQLITE_TRANSIENT) != SQLITE_OK ||
        sqlite3_step(update.get()) != SQLITE_DONE || sqlite3_changes(db) != 1) unavailable();
  }
}
} // namespace
StorageSnapshot storageSnapshot(sqlite3* db, std::int64_t userId, const std::filesystem::path& root) {
  const auto configuredLimits = limits();
  requireActor(db,userId);
  Fd directory(openRoot(root));
  return snapshot(db,userId,directory.value,configuredLimits);
}
void requireStorageAdmission(sqlite3* db, std::int64_t userId, std::uint64_t incomingBytes,
                             const std::filesystem::path& root) {
  if (sqlite3_get_autocommit(db) || sqlite3_txn_state(db,"main") != SQLITE_TXN_WRITE)
    throw StorageLimitError(503,"storage_transaction_required","Envio exige reserva transacional de armazenamento.");
  if (!incomingBytes || incomingBytes > maxPdfBytes)
    throw StorageLimitError(400,"invalid_pdf_size","PDF ausente ou acima de 10 MiB.");
  const auto configuredLimits = limits();
  requireActor(db,userId);
  Fd directory(openRoot(root));
  // A mesma transação de escrita serializa a contagem, admissão e INSERT do chamador.
  reconcileUnknown(db,userId,directory.value,root);
  const auto state = snapshot(db,userId,directory.value,configuredLimits);
  if (state.unknownSizes) accountingRequired();
  if (state.userUsedBytes > state.limits.userBytes || incomingBytes > state.limits.userBytes-state.userUsedBytes)
    throw StorageLimitError(429,"storage_user_limit","Limite de armazenamento da conta atingido.");
  if (state.institutionUsedBytes > state.limits.institutionBytes || incomingBytes > state.limits.institutionBytes-state.institutionUsedBytes)
    throw StorageLimitError(429,"storage_institution_limit","Limite de armazenamento da instituição atingido.");
  if (state.availableBytes < state.limits.minFreeBytes || incomingBytes > state.availableBytes-state.limits.minFreeBytes)
    throw StorageLimitError(507,"storage_disk_reserve","Espaço livre insuficiente para preservar a reserva de segurança.");
}
} // namespace devsphere
