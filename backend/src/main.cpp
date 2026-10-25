#include "database.hpp"
#include "http_server.hpp"
#include "security.hpp"
#include <chrono>
#include <sqlite3.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
std::string environment(const char *name, const std::string &fallback) {
  const char *value = std::getenv(name);
  return value && *value ? value : fallback;
}
// Antes de migrations pendentes, cria snapshot pela API SQLite (inclui WAL).
// Produção exige cifra e segredo externo; desenvolvimento permite cópia
// privada.
void backupBeforeMigration(const std::string &path,
                           const std::string &migrations) {
  if (!std::filesystem::is_regular_file(path) ||
      std::filesystem::file_size(path) == 0)
    return;
  sqlite3 *source = nullptr;
  if (sqlite3_open_v2(path.c_str(), &source, SQLITE_OPEN_READWRITE, nullptr) !=
      SQLITE_OK) {
    if (source)
      sqlite3_close(source);
    throw std::runtime_error("não foi possível abrir base para backup");
  }
  sqlite3_busy_timeout(source, 5000);
  bool pending = false;
  for (const auto &entry : std::filesystem::directory_iterator(migrations)) {
    if (entry.path().extension() != ".sql")
      continue;
    sqlite3_stmt *query = nullptr;
    int rc = sqlite3_prepare_v2(
        source, "SELECT 1 FROM schema_migrations WHERE version=?", -1, &query,
        nullptr);
    if (rc != SQLITE_OK && std::string(sqlite3_errmsg(source))
                                   .find("no such table: schema_migrations") ==
                               std::string::npos) {
      const std::string failure = sqlite3_errmsg(source);
      sqlite3_finalize(query);
      sqlite3_close(source);
      throw std::runtime_error("não foi possível conferir migrations: " +
                               failure);
    }
    if (rc == SQLITE_OK)
      sqlite3_bind_text(query, 1, entry.path().filename().c_str(), -1,
                        SQLITE_TRANSIENT);
    if (rc != SQLITE_OK || sqlite3_step(query) != SQLITE_ROW)
      pending = true;
    sqlite3_finalize(query);
  }
  if (!pending) {
    sqlite3_close(source);
    return;
  }
  auto directory = std::filesystem::path(path).parent_path() / "backups";
  std::filesystem::create_directories(directory);
  chmod(directory.c_str(), 0700);
  auto target =
      directory /
      ("pre-migration-" +
       std::to_string(
           std::chrono::system_clock::now().time_since_epoch().count()));
  const char *secret = std::getenv("DEVSPHERE_BACKUP_PASSWORD");
  if (secret && *secret) {
    sqlite3_close(source);
    auto python = environment("DEVSPHERE_PYTHON", "python3");
    auto script = environment(
        "DEVSPHERE_BACKUP_TOOL",
        (std::filesystem::absolute(migrations).parent_path().parent_path() /
         "tools/secure_backup.py")
            .string());
    auto destination = target.string() + ".pvb";
    pid_t child = fork();
    if (child == 0) {
      execlp(python.c_str(), python.c_str(), script.c_str(), "backup",
             path.c_str(), destination.c_str(), static_cast<char *>(nullptr));
      _exit(127);
    }
    int status = 0;
    if (child < 0 || waitpid(child, &status, 0) < 0 || !WIFEXITED(status) ||
        WEXITSTATUS(status) != 0)
      throw std::runtime_error(
          "backup cifrado falhou; migrations não aplicadas");
    std::cout << "Backup cifrado anterior às migrations: " << destination
              << '\n';
    return;
  }
  if (environment("DEVSPHERE_ENV", "development") == "production") {
    sqlite3_close(source);
    throw std::runtime_error(
        "migrations de produção exigem DEVSPHERE_BACKUP_PASSWORD e Python com "
        "cryptography");
  }
  target += ".db";
  sqlite3 *destination = nullptr;
  if (sqlite3_open(target.c_str(), &destination) != SQLITE_OK) {
    sqlite3_close(source);
    if (destination)
      sqlite3_close(destination);
    throw std::runtime_error("destino de backup indisponível");
  }
  chmod(target.c_str(), 0600);
  auto snapshot = sqlite3_backup_init(destination, "main", source, "main");
  int result = snapshot ? sqlite3_backup_step(snapshot, -1) : SQLITE_ERROR;
  int finish = snapshot ? sqlite3_backup_finish(snapshot) : SQLITE_ERROR;
  sqlite3_close(destination);
  sqlite3_close(source);
  if (result != SQLITE_DONE || finish != SQLITE_OK)
    throw std::runtime_error("snapshot falhou; migrations não aplicadas");
  std::cout << "Snapshot local privado anterior às migrations: " << target
            << ". Configure DEVSPHERE_BACKUP_PASSWORD para cifra.\n";
}
} // namespace

int main(int argc, char *argv[]) {
  umask(0077); // Banco, WAL e arquivos internos nascem privados.
  try {
    const std::string databasePath =
        environment("DEVSPHERE_DB_PATH", "data/devsphere.db");
    const std::string migrationsPath =
        environment("DEVSPHERE_MIGRATIONS_DIR", "migrations");
    const auto parent = std::filesystem::path(databasePath).parent_path();
    if (!parent.empty())
      std::filesystem::create_directories(parent);

    backupBeforeMigration(databasePath, migrationsPath);
    devsphere::Database database(databasePath);
    database.migrate(migrationsPath);
    database.seedLegacyCases(
        environment("DEVSPHERE_CASE_SEED",
                    (std::filesystem::path(migrationsPath).parent_path() /
                     "seeds/legacy-cases.json")
                        .string()));

    // Contas administrativas só podem ser criadas no servidor. A senha vem
    // do ambiente e nunca aparece em arquivos ou argumentos do processo.
    if (argc >= 2 && std::string(argv[1]) == "--create-admin") {
      if (argc != 5) {
        std::cerr << "Uso: --create-admin NOME EMAIL EMAIL_NOTIFICACAO\n";
        return 2;
      }
      const char *password = std::getenv("DEVSPHERE_SEED_PASSWORD");
      if (!password) {
        std::cerr
            << "Defina DEVSPHERE_SEED_PASSWORD para criar o administrador.\n";
        return 2;
      }
      const std::string email = devsphere::normalizeEmail(argv[3]);
      const std::string notificationEmail = devsphere::normalizeEmail(argv[4]);
      if (!devsphere::isValidEmail(email) ||
          !devsphere::isValidEmail(notificationEmail)) {
        throw std::invalid_argument("e-mail inválido");
      }
      database.createAdmin(argv[2], email, devsphere::hashPassword(password),
                           notificationEmail);
      std::cout << "Administrador criado com sucesso.\n";
      return 0;
    }

    // O domínio institucional precisa ser autorizado explicitamente antes de
    // aparecer como opção válida nos formulários públicos de cadastro.
    if (argc >= 2 && std::string(argv[1]) == "--allow-domain") {
      if (argc != 3) {
        std::cerr << "Uso: --allow-domain DOMINIO\n";
        return 2;
      }
      std::string domain = argv[2];
      std::transform(
          domain.begin(), domain.end(), domain.begin(),
          [](unsigned char character) { return std::tolower(character); });
      if (domain.empty() || domain.find('@') != std::string::npos ||
          domain.find('.') == std::string::npos) {
        throw std::invalid_argument("domínio institucional inválido");
      }
      database.addInstitutionalDomain(domain);
      std::cout << "Domínio institucional autorizado.\n";
      return 0;
    }

    // Usuários de desenvolvimento são criados apenas por comando explícito.
    // A senha vem do ambiente para não aparecer no histórico do terminal.
    if (argc >= 2 && std::string(argv[1]) == "--create-user") {
      if (argc != 5) {
        std::cerr << "Uso: --create-user NOME EMAIL student|teacher\n";
        return 2;
      }
      const char *password = std::getenv("DEVSPHERE_SEED_PASSWORD");
      if (!password) {
        std::cerr << "Defina DEVSPHERE_SEED_PASSWORD para criar o usuário.\n";
        return 2;
      }
      const std::string email = devsphere::normalizeEmail(argv[3]);
      if (!devsphere::isValidEmail(email)) {
        throw std::invalid_argument("e-mail inválido");
      }
      database.createUser(argv[2], email, devsphere::hashPassword(password),
                          argv[4]);
      std::cout << "Usuário criado com sucesso.\n";
      return 0;
    }

    if (argc >= 2 && std::string(argv[1]) == "--migrate") {
      std::cout << "Migrações aplicadas.\n";
      return 0;
    }

    const std::string host = environment("DEVSPHERE_HOST", "127.0.0.1");
    const int port = std::stoi(environment("DEVSPHERE_PORT", "8080"));
    const bool production =
        environment("DEVSPHERE_ENV", "development") == "production";
    database.purgeExpiredSessions();
    devsphere::HttpServer server(database, host, port, production);
    server.run();
  } catch (const std::exception &error) {
    std::cerr << "Falha ao iniciar: " << error.what() << '\n';
    return 1;
  }
}
