#include "database.hpp"
#include "http_server.hpp"
#include "security.hpp"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
std::string environment(const char* name, const std::string& fallback) {
  const char* value = std::getenv(name);
  return value && *value ? value : fallback;
}
}  // namespace

int main(int argc, char* argv[]) {
  try {
    const std::string databasePath =
        environment("DEVSPHERE_DB_PATH", "data/devsphere.db");
    const std::string migrationsPath =
        environment("DEVSPHERE_MIGRATIONS_DIR", "migrations");
    const auto parent = std::filesystem::path(databasePath).parent_path();
    if (!parent.empty()) std::filesystem::create_directories(parent);

    devsphere::Database database(databasePath);
    database.migrate(migrationsPath);

    // Contas administrativas só podem ser criadas no servidor. A senha vem
    // do ambiente e nunca aparece em arquivos ou argumentos do processo.
    if (argc >= 2 && std::string(argv[1]) == "--create-admin") {
      if (argc != 5) {
        std::cerr << "Uso: --create-admin NOME EMAIL EMAIL_NOTIFICACAO\n";
        return 2;
      }
      const char* password = std::getenv("DEVSPHERE_SEED_PASSWORD");
      if (!password) {
        std::cerr << "Defina DEVSPHERE_SEED_PASSWORD para criar o administrador.\n";
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
      std::transform(domain.begin(), domain.end(), domain.begin(),
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
      const char* password = std::getenv("DEVSPHERE_SEED_PASSWORD");
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
  } catch (const std::exception& error) {
    std::cerr << "Falha ao iniciar: " << error.what() << '\n';
    return 1;
  }
}
