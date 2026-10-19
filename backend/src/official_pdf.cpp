#include "official_pdf.hpp"
#include <chrono>
#include <cstdlib>
#include <fcntl.h>
#include <filesystem>
#include <fstream>
#include <signal.h>
#include <stdexcept>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>
#include <vector>
extern char **environ;

namespace devsphere {
std::string renderOfficialPdf(const std::string &report) {
  // Arquivos 0600 em diretório 0700 evitam divulgar informações acadêmicas a
  // outros usuários. Não há shell, interpolação de comando ou acesso ao banco.
  std::string pattern =
      (std::filesystem::temp_directory_path() / "pv-report-XXXXXX").string();
  std::vector<char> buffer(pattern.begin(), pattern.end());
  buffer.push_back('\0');
  char *created = mkdtemp(buffer.data());
  if (!created)
    throw std::runtime_error("não foi possível preparar PDF oficial");
  const std::filesystem::path directory(created);
  struct Cleanup {
    std::filesystem::path path;
    ~Cleanup() {
      std::error_code ec;
      std::filesystem::remove_all(path, ec);
    }
  } cleanup{directory};
  auto input = directory / "report.json", output = directory / "report.pdf";
  {
    int fd = open(input.c_str(), O_WRONLY | O_CREAT | O_EXCL, 0600);
    if (fd < 0)
      throw std::runtime_error("não foi possível gravar relatório temporário");
    std::size_t offset = 0;
    while (offset < report.size()) {
      auto n = write(fd, report.data() + offset, report.size() - offset);
      if (n <= 0) {
        close(fd);
        throw std::runtime_error("erro no relatório temporário");
      }
      offset += static_cast<std::size_t>(n);
    }
    close(fd);
  }
  std::string python = std::getenv("DEVSPHERE_PYTHON")
                           ? std::getenv("DEVSPHERE_PYTHON")
                           : "python3";
  std::filesystem::path script = std::getenv("DEVSPHERE_PDF_RENDERER")
                                     ? std::getenv("DEVSPHERE_PDF_RENDERER")
                                     : "tools/render_official_report.py";
  if (!std::filesystem::is_regular_file(script) &&
      !std::getenv("DEVSPHERE_PDF_RENDERER"))
    script = "../tools/render_official_report.py";
  if (!std::filesystem::is_regular_file(script))
    throw std::runtime_error("renderizador PDF oficial não configurado");
  pid_t child = fork();
  if (child < 0)
    throw std::runtime_error("não foi possível iniciar renderizador PDF");
  if (child == 0) {
    // O renderizador recebe somente o ambiente necessário ao Python; MFA,
    // senhas de backup e credenciais do servidor não atravessam a fronteira.
    std::vector<std::string> privateNames;
    for (char **entry = environ; *entry; ++entry) {
      std::string name(*entry);
      name = name.substr(0, name.find('='));
      if (name.rfind("DEVSPHERE_", 0) == 0)
        privateNames.push_back(name);
    }
    for (const auto &name : privateNames)
      unsetenv(name.c_str());
    int nullfd = open("/dev/null", O_WRONLY);
    if (nullfd >= 0) {
      dup2(nullfd, STDOUT_FILENO);
      dup2(nullfd, STDERR_FILENO);
      close(nullfd);
    }
    execlp(python.c_str(), python.c_str(), script.c_str(), input.c_str(),
           output.c_str(), static_cast<char *>(nullptr));
    _exit(127);
  }
  int status = 0;
  const auto deadline =
      std::chrono::steady_clock::now() + std::chrono::seconds(20);
  while (waitpid(child, &status, WNOHANG) == 0) {
    if (std::chrono::steady_clock::now() > deadline) {
      kill(child, SIGKILL);
      waitpid(child, &status, 0);
      throw std::runtime_error("tempo limite do PDF oficial excedido");
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
  }
  if (!WIFEXITED(status) || WEXITSTATUS(status) != 0 ||
      !std::filesystem::is_regular_file(output) ||
      std::filesystem::file_size(output) > 20 * 1024 * 1024)
    throw std::runtime_error("PDF oficial indisponível; configure Python com "
                             "reportlab e tente novamente");
  std::ifstream pdf(output, std::ios::binary);
  std::string data{std::istreambuf_iterator<char>(pdf),
                   std::istreambuf_iterator<char>()};
  if (data.rfind("%PDF-", 0) != 0)
    throw std::runtime_error("renderizador não produziu PDF válido");
  return data;
}
} // namespace devsphere
