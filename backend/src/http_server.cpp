#include "http_server.hpp"

#include "security.hpp"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cstring>
#include <cerrno>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
#include <sstream>
#include <string_view>
#include <stdexcept>
#include <vector>

namespace devsphere {
namespace {
constexpr std::size_t kMaxRequestBytes = 22 * 1024 * 1024;

std::string lower(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(),
                 [](unsigned char c) { return std::tolower(c); });
  return value;
}

std::string trim(std::string value) {
  const auto isContent = [](unsigned char c) { return !std::isspace(c); };
  value.erase(value.begin(), std::find_if(value.begin(), value.end(), isContent));
  value.erase(std::find_if(value.rbegin(), value.rend(), isContent).base(),
              value.end());
  return value;
}

std::optional<std::string> jsonString(const std::string& json,
                                      const std::string& key) {
  const std::regex pattern("\\\"" + key +
                           "\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"");
  std::smatch match;
  if (!std::regex_search(json, match, pattern)) return std::nullopt;
  std::string value = match[1];
  std::string decoded;
  for (std::size_t i = 0; i < value.size(); ++i) {
    if (value[i] == '\\' && i + 1 < value.size()) {
      ++i;
      switch (value[i]) {
        case 'n': decoded.push_back('\n'); break;
        case 'r': decoded.push_back('\r'); break;
        case 't': decoded.push_back('\t'); break;
        default: decoded.push_back(value[i]);
      }
    } else {
      decoded.push_back(value[i]);
    }
  }
  return decoded;
}

std::optional<std::int64_t> jsonInteger(const std::string& json,
                                                const std::string& key) {
  const std::regex pattern("\"" + key +
                           "\"\\s*:\\s*\"?([0-9]+)\"?");
  std::smatch match;
  if (!std::regex_search(json, match, pattern)) return std::nullopt;
  try {
    return std::stoll(match[1]);
  } catch (...) {
    return std::nullopt;
  }
}

std::optional<std::string> decodeBase64(const std::string& encoded) {
  static const std::string alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (encoded.empty() || encoded.size() % 4 != 0) return std::nullopt;
  std::string decoded;
  decoded.reserve(encoded.size() / 4 * 3);

  for (std::size_t offset = 0; offset < encoded.size(); offset += 4) {
    std::uint32_t value = 0;
    int padding = 0;
    for (int index = 0; index < 4; ++index) {
      const char character = encoded[offset + static_cast<std::size_t>(index)];
      if (character == '=') {
        ++padding;
        value <<= 6;
      } else {
        if (padding > 0) return std::nullopt;
        const auto position = alphabet.find(character);
        if (position == std::string::npos) return std::nullopt;
        value = (value << 6) | static_cast<std::uint32_t>(position);
      }
    }
    if (padding > 2 || (padding > 0 && offset + 4 != encoded.size())) {
      return std::nullopt;
    }
    decoded.push_back(static_cast<char>((value >> 16) & 0xff));
    if (padding < 2) decoded.push_back(static_cast<char>((value >> 8) & 0xff));
    if (padding < 1) decoded.push_back(static_cast<char>(value & 0xff));
  }
  return decoded;
}

struct MultipartFile {
  std::string filename;
  std::string mimeType;
  std::string data;
};

std::optional<MultipartFile> multipartFile(const HttpRequest& request,
                                                const std::string& fieldName = "file") {
  const auto contentType = request.headers.find("content-type");
  if (contentType == request.headers.end()) return std::nullopt;
  const std::regex boundaryPattern(R"REGEX(boundary=(?:"([^"]+)"|([^;\s]+)))REGEX");
  std::smatch boundaryMatch;
  if (!std::regex_search(contentType->second, boundaryMatch,
                         boundaryPattern)) {
    return std::nullopt;
  }
  const std::string boundary =
      boundaryMatch[1].matched ? boundaryMatch[1].str()
                               : boundaryMatch[2].str();
  if (boundary.empty() || boundary.size() > 200) return std::nullopt;

  const std::string delimiter = "--" + boundary;
  std::size_t part = request.body.find(delimiter);
  while (part != std::string::npos) {
    const auto headerStart = request.body.find("\r\n", part + delimiter.size());
    if (headerStart == std::string::npos) return std::nullopt;
    const auto headerEnd = request.body.find("\r\n\r\n", headerStart + 2);
    if (headerEnd == std::string::npos) return std::nullopt;
    const std::string headers =
        request.body.substr(headerStart + 2, headerEnd - headerStart - 2);
    const std::string lowerHeaders = lower(headers);
    const auto dataStart = headerEnd + 4;
    const auto dataEnd = request.body.find("\r\n" + delimiter, dataStart);
    if (dataEnd == std::string::npos) return std::nullopt;

    if (lowerHeaders.find("content-disposition: form-data") !=
            std::string::npos &&
        lowerHeaders.find("name=\"" + lower(fieldName) + "\"") != std::string::npos) {
      const std::regex filenamePattern(R"REGEX(filename="([^"]*)")REGEX");
      const std::regex mimePattern(R"(content-type:\s*([^\r\n;]+))",
                                   std::regex::icase);
      std::smatch filenameMatch;
      std::smatch mimeMatch;
      if (!std::regex_search(headers, filenameMatch, filenamePattern) ||
          !std::regex_search(headers, mimeMatch, mimePattern)) {
        return std::nullopt;
      }
      std::string filename = filenameMatch[1];
      const auto separator = filename.find_last_of("/\\");
      if (separator != std::string::npos) filename.erase(0, separator + 1);
      if (filename.empty() || filename.size() > 255) return std::nullopt;
      return MultipartFile{filename, lower(trim(mimeMatch[1].str())),
                           request.body.substr(dataStart, dataEnd - dataStart)};
    }
    part = request.body.find(delimiter, dataEnd + 2);
  }
  return std::nullopt;
}

// Extrai um campo textual do mesmo multipart usado pelo PDF. O limite de
// requisição global impede que campos malformados provoquem consumo ilimitado.
std::optional<std::string> multipartText(const HttpRequest& request,
                                         const std::string& fieldName) {
  const auto contentType = request.headers.find("content-type");
  if (contentType == request.headers.end()) return std::nullopt;
  const std::regex boundaryPattern(R"REGEX(boundary=(?:"([^"]+)"|([^;\s]+)))REGEX");
  std::smatch boundaryMatch;
  if (!std::regex_search(contentType->second, boundaryMatch, boundaryPattern)) return std::nullopt;
  const std::string boundary = boundaryMatch[1].matched ? boundaryMatch[1].str() : boundaryMatch[2].str();
  if (boundary.empty() || boundary.size() > 200) return std::nullopt;
  const std::string delimiter = "--" + boundary;
  std::size_t part = request.body.find(delimiter);
  while (part != std::string::npos) {
    const auto headerStart = request.body.find("\r\n", part + delimiter.size());
    if (headerStart == std::string::npos) return std::nullopt;
    const auto headerEnd = request.body.find("\r\n\r\n", headerStart + 2);
    if (headerEnd == std::string::npos) return std::nullopt;
    const std::string headers = request.body.substr(headerStart + 2, headerEnd - headerStart - 2);
    const auto dataStart = headerEnd + 4;
    const auto dataEnd = request.body.find("\r\n" + delimiter, dataStart);
    if (dataEnd == std::string::npos) return std::nullopt;
    const std::regex namePattern("name=\\\"" + fieldName + "\\\"");
    if (std::regex_search(headers, namePattern) &&
        lower(headers).find("filename=") == std::string::npos) {
      return request.body.substr(dataStart, dataEnd - dataStart);
    }
    part = request.body.find(delimiter, dataEnd + 2);
  }
  return std::nullopt;
}

std::optional<std::string> structuredReport(const std::string& pdf) {
  constexpr std::string_view marker = "%PV_REPORT_V1:";
  const std::size_t tailStart =
      pdf.size() > 2'000'000 ? pdf.size() - 2'000'000 : 0;
  const auto markerPosition = pdf.rfind(marker);
  if (markerPosition == std::string::npos || markerPosition < tailStart) {
    return std::nullopt;
  }
  const auto encodedStart = markerPosition + marker.size();
  const auto encodedEnd = pdf.find_first_of("\r\n", encodedStart);
  const std::string encoded =
      pdf.substr(encodedStart, encodedEnd - encodedStart);
  return decodeBase64(encoded);
}

HttpResponse jsonResponse(int status, std::string body) {
  return {status,
          {{"Content-Type", "application/json; charset=utf-8"}},
          std::move(body)};
}

HttpResponse jsonError(int status, const std::string& code,
                       const std::string& message) {
  return {status,
          {{"Content-Type", "application/json; charset=utf-8"}},
          "{\"error\":{\"code\":\"" + jsonEscape(code) +
              "\",\"message\":\"" + jsonEscape(message) + "\"}}"};
}

std::string reasonPhrase(int status) {
  switch (status) {
    case 200: return "OK";
    case 201: return "Created";
    case 204: return "No Content";
    case 400: return "Bad Request";
    case 401: return "Unauthorized";
    case 403: return "Forbidden";
    case 404: return "Not Found";
    case 409: return "Conflict";
    case 413: return "Payload Too Large";
    case 429: return "Too Many Requests";
    case 500: return "Internal Server Error";
    case 501: return "Not Implemented";
    default: return "Error";
  }
}

std::optional<std::string> cookieValue(const HttpRequest& request,
                                       const std::string& name) {
  const auto header = request.headers.find("cookie");
  if (header == request.headers.end()) return std::nullopt;
  std::stringstream stream(header->second);
  std::string part;
  while (std::getline(stream, part, ';')) {
    const auto separator = part.find('=');
    if (separator == std::string::npos) continue;
    if (trim(part.substr(0, separator)) == name) {
      return trim(part.substr(separator + 1));
    }
  }
  return std::nullopt;
}

std::optional<std::int64_t> pathId(const std::string& path,
                                   const std::regex& pattern) {
  std::smatch match;
  if (!std::regex_match(path, match, pattern)) return std::nullopt;
  try {
    return std::stoll(match[1]);
  } catch (...) {
    return std::nullopt;
  }
}

std::string mimeType(const std::filesystem::path& path) {
  const auto extension = lower(path.extension().string());
  if (extension == ".html") return "text/html; charset=utf-8";
  if (extension == ".css") return "text/css; charset=utf-8";
  if (extension == ".js") return "application/javascript; charset=utf-8";
  if (extension == ".png") return "image/png";
  if (extension == ".svg") return "image/svg+xml";
  if (extension == ".pdf") return "application/pdf";
  return "application/octet-stream";
}

std::optional<HttpResponse> staticFile(const HttpRequest& request) {
  if (request.method != "GET" || request.path.rfind("/api/", 0) == 0) {
    return std::nullopt;
  }
  const char* configured = std::getenv("DEVSPHERE_FRONTEND_DIR");
  std::filesystem::path root =
      configured ? configured : std::filesystem::path("../frontend");
  if (!std::filesystem::exists(root / "index.html")) root = "..";

  std::string relative = request.path == "/" ? "index.html" : request.path.substr(1);
  if (relative.find("..") != std::string::npos) {
    return jsonError(400, "invalid_path", "Caminho inválido.");
  }
  const auto file = root / relative;
  if (!std::filesystem::is_regular_file(file)) return std::nullopt;
  std::ifstream input(file, std::ios::binary);
  std::ostringstream content;
  content << input.rdbuf();
  return HttpResponse{200, {{"Content-Type", mimeType(file)}}, content.str()};
}

std::string serialize(const HttpResponse& response) {
  std::ostringstream output;
  output << "HTTP/1.1 " << response.status << ' '
         << reasonPhrase(response.status) << "\r\n";
  for (const auto& [name, value] : response.headers) {
    output << name << ": " << value << "\r\n";
  }
  output << "Content-Length: " << response.body.size() << "\r\n"
         << "X-Content-Type-Options: nosniff\r\n"
         << "Referrer-Policy: no-referrer\r\n"
         << "Content-Security-Policy: default-src 'self'; "
            "img-src 'self' data:; style-src 'self'; script-src 'self'; "
            "connect-src 'self'; font-src 'self' data:; object-src 'none'; "
            "base-uri 'none'; frame-ancestors 'none'\r\n"
         << "Connection: close\r\n\r\n"
         << response.body;
  return output.str();
}

std::optional<HttpRequest> readRequest(int socket, const std::string& remote) {
  std::string data;
  std::array<char, 8192> buffer{};
  std::size_t expected = 0;
  while (data.size() < kMaxRequestBytes) {
    const auto received = recv(socket, buffer.data(), buffer.size(), 0);
    if (received <= 0) break;
    data.append(buffer.data(), static_cast<std::size_t>(received));
    const auto endHeaders = data.find("\r\n\r\n");
    if (endHeaders != std::string::npos) {
      if (expected == 0) {
        const std::string headers = lower(data.substr(0, endHeaders));
        const std::regex lengthPattern(R"(content-length:\s*([0-9]+))");
        std::smatch match;
        if (std::regex_search(headers, match, lengthPattern)) {
          expected = endHeaders + 4 + std::stoul(match[1]);
          if (expected > kMaxRequestBytes) return std::nullopt;
        } else {
          expected = endHeaders + 4;
        }
      }
      if (data.size() >= expected) break;
    }
  }
  if (data.empty() || data.size() >= kMaxRequestBytes) return std::nullopt;

  const auto endHeaders = data.find("\r\n\r\n");
  if (endHeaders == std::string::npos) return std::nullopt;
  std::stringstream headerStream(data.substr(0, endHeaders));
  HttpRequest request;
  request.remoteAddress = remote;
  std::string line;
  if (!std::getline(headerStream, line)) return std::nullopt;
  if (!line.empty() && line.back() == '\r') line.pop_back();
  std::stringstream requestLine(line);
  std::string version;
  requestLine >> request.method >> request.path >> version;
  if (request.method.empty() || request.path.empty()) return std::nullopt;
  const auto query = request.path.find('?');
  if (query != std::string::npos) request.path.resize(query);

  while (std::getline(headerStream, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    const auto separator = line.find(':');
    if (separator != std::string::npos) {
      request.headers[lower(trim(line.substr(0, separator)))] =
          trim(line.substr(separator + 1));
    }
  }
  request.body = data.substr(endHeaders + 4);
  return request;
}

std::optional<std::string> allowedCorsOrigin(const HttpRequest& request,
                                                    bool production) {
  const auto originHeader = request.headers.find("origin");
  if (originHeader == request.headers.end()) return std::nullopt;
  const std::string& origin = originHeader->second;

  // Em desenvolvimento, apenas as duas formas usuais do Live Server são
  // aceitas. Produção exige uma lista explícita no ambiente.
  if (!production &&
      (origin == "http://127.0.0.1:5501" ||
       origin == "http://localhost:5501" ||
       origin == "http://127.0.0.1:8080" ||
       origin == "http://localhost:8080")) {
    return origin;
  }

  const char* configured = std::getenv("DEVSPHERE_ALLOWED_ORIGINS");
  if (!configured) return std::nullopt;
  std::stringstream origins(configured);
  std::string candidate;
  while (std::getline(origins, candidate, ',')) {
    if (trim(candidate) == origin) return origin;
  }
  return std::nullopt;
}

void applyCors(const HttpRequest& request, HttpResponse& response,
               bool production) {
  const auto origin = allowedCorsOrigin(request, production);
  if (!origin) return;
  response.headers["Access-Control-Allow-Origin"] = *origin;
  response.headers["Access-Control-Allow-Credentials"] = "true";
  response.headers["Access-Control-Allow-Headers"] = "Content-Type, Idempotency-Key";
  response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS";
  response.headers["Vary"] = "Origin";
}

bool isJson(const HttpRequest& request) {
  const auto contentType = request.headers.find("content-type");
  return contentType != request.headers.end() &&
         lower(contentType->second).find("application/json") != std::string::npos;
}
}  // namespace

HttpServer::HttpServer(Database& database, std::string host, int port,
                       bool production)
    : database_(database),
      host_(std::move(host)),
      port_(port),
      production_(production) {}

std::optional<SessionUser> HttpServer::authenticate(
    const HttpRequest& request) {
  const auto token = cookieValue(request, "devsphere_session");
  if (!token || token->size() != 64) return std::nullopt;
  return database_.findSession(sha256Hex(*token));
}

HttpResponse HttpServer::route(const HttpRequest& request) {
  // Rejeita também requisições simples de origens desconhecidas. Sem esta
  // verificação, o navegador esconderia a resposta, mas a ação poderia ocorrer.
  if (request.headers.contains("origin") &&
      !allowedCorsOrigin(request, production_)) {
    return jsonError(403, "origin_not_allowed", "Origem não autorizada.");
  }

  // Responde à verificação CORS feita pelo navegador antes de requisições com JSON.
  if (request.method == "OPTIONS") {
    return allowedCorsOrigin(request, production_)
               ? HttpResponse{204, {{"Cache-Control", "no-store"}}, ""}
               : jsonError(403, "origin_not_allowed", "Origem não autorizada.");
  }

  // Evita uma requisição 404 automática do navegador quando não há ícone configurado.
  if (request.method == "GET" && request.path == "/favicon.ico") {
    return {204, {{"Cache-Control", "public, max-age=86400"}}, ""};
  }

  if (request.method == "GET" && request.path == "/api/v1/health") {
    return jsonResponse(200, "{\"status\":\"ok\"}");
  }

  // O cadastro público cria uma solicitação inativa. O papel admin nunca
  // é aceito nesta rota e só pode ser concedido pelo comando do servidor.
  if (request.method == "POST" &&
      (request.path == "/api/v1/auth/register/student" ||
       request.path == "/api/v1/auth/register/teacher")) {
    if (!isJson(request)) {
      return jsonError(400, "invalid_content_type",
                       "Envie os dados como application/json.");
    }
    const std::string role =
        request.path.ends_with("/teacher") ? "teacher" : "student";
    const auto name = jsonString(request.body, "name");
    const auto emailInput = jsonString(request.body, "email");
    const auto password = jsonString(request.body, "password");
    const auto className = jsonString(request.body, "className").value_or("");
    const auto professionalRegistration =
        jsonString(request.body, "professionalRegistration").value_or("");
    if (!name || trim(*name).size() < 3 || trim(*name).size() > 120 ||
        !emailInput || !password || className.size() > 80 ||
        professionalRegistration.size() > 80) {
      return jsonError(400, "invalid_request",
                       "Nome, e-mail institucional e senha são obrigatórios.");
    }
    const auto email = normalizeEmail(*emailInput);
    if (!isValidEmail(email) || !database_.isInstitutionalEmailAllowed(email)) {
      return jsonError(400, "institutional_email_required",
                       "Use um e-mail de domínio institucional autorizado.");
    }
    try {
      const auto requestId = database_.createRegistration(
          trim(*name), email, hashPassword(*password), role, trim(className),
          trim(professionalRegistration));
      return jsonResponse(
          201, "{\"requestId\":" + std::to_string(requestId) +
                   ",\"status\":\"pending\",\"message\":\"Cadastro enviado para análise da instituição.\"}");
    } catch (const std::invalid_argument& error) {
      return jsonError(400, "invalid_registration", error.what());
    } catch (const std::runtime_error& error) {
      const std::string message = error.what();
      if (message.find("UNIQUE constraint failed") != std::string::npos) {
        return jsonError(409, "email_already_registered",
                         "Este e-mail já foi cadastrado ou aguarda análise.");
      }
      throw;
    }
  }

  if (request.method == "POST" && request.path == "/api/v1/auth/login") {
    if (!isJson(request)) {
      return jsonError(400, "invalid_content_type",
                       "Envie os dados como application/json.");
    }
    const auto emailInput = jsonString(request.body, "email");
    const auto password = jsonString(request.body, "password");
    if (!emailInput || !password) {
      return jsonError(400, "invalid_request", "E-mail e senha são obrigatórios.");
    }
    const auto email = normalizeEmail(*emailInput);
    if (!isValidEmail(email)) {
      return jsonError(401, "invalid_credentials", "E-mail ou senha inválidos.");
    }
    const std::string rateKey = request.remoteAddress + "|" + email;
    if (!limiter_.allow(rateKey)) {
      return jsonError(429, "too_many_attempts",
                       "Muitas tentativas. Aguarde antes de tentar novamente.");
    }

    const auto user = database_.findUserByEmail(email);
    static const std::string dummyHash =
        hashPassword("credencial-ficticia-segura");
    const bool passwordValid = verifyPassword(
        *password, user ? user->passwordHash : dummyHash);
    if (!user || !user->active || !passwordValid) {
      return jsonError(401, "invalid_credentials", "E-mail ou senha inválidos.");
    }

    limiter_.success(rateKey);
    const auto token = randomToken();
    database_.createSession(user->id, sha256Hex(token),
                            "+8 hours");
    database_.recordLogin(user->id);
    std::string cookie =
        "devsphere_session=" + token +
        "; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800";
    if (production_) cookie += "; Secure";
    return {200,
            {{"Content-Type", "application/json; charset=utf-8"},
             {"Set-Cookie", cookie},
             {"Cache-Control", "no-store"}},
            "{\"user\":{\"id\":" + std::to_string(user->id) +
                ",\"name\":\"" + jsonEscape(user->fullName) +
                "\",\"email\":\"" + jsonEscape(user->email) +
                "\",\"role\":\"" + user->role + "\"}}"};
  }

  if (request.method == "POST" && request.path == "/api/v1/auth/logout") {
    if (const auto token = cookieValue(request, "devsphere_session")) {
      database_.deleteSession(sha256Hex(*token));
    }
    std::string cookie =
        "devsphere_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
    if (production_) cookie += "; Secure";
    return {204, {{"Set-Cookie", cookie}, {"Cache-Control", "no-store"}}, ""};
  }

  const auto user = authenticate(request);
  if (request.method == "GET" && request.path == "/api/v1/auth/session") {
    if (!user) return jsonError(401, "unauthenticated", "Sessão ausente ou expirada.");
    return {200,
            {{"Cache-Control", "no-store"},
             {"Content-Type", "application/json; charset=utf-8"}},
            "{\"user\":{\"id\":" + std::to_string(user->id) +
                ",\"name\":\"" + jsonEscape(user->fullName) +
                "\",\"email\":\"" + jsonEscape(user->email) +
                "\",\"role\":\"" + user->role + "\"}}"};
  }

  if (request.path.rfind("/api/", 0) == 0 && !user) {
    return jsonError(401, "unauthenticated", "Faça login para continuar.");
  }

  // O painel administrativo concentra solicitações, configuração institucional
  // e decisões auditadas. Nenhuma dessas rotas aceita um papel acadêmico.
  if (request.method == "GET" &&
      request.path == "/api/v1/admin/registrations") {
    if (user->role != "admin") {
      return jsonError(403, "forbidden", "Acesso exclusivo de administrador.");
    }
    return jsonResponse(200, database_.listPendingRegistrations());
  }
  if (request.method == "GET" &&
      request.path == "/api/v1/admin/configuration") {
    if (user->role != "admin") {
      return jsonError(403, "forbidden", "Acesso exclusivo de administrador.");
    }
    return jsonResponse(200, database_.adminConfiguration());
  }
  static const std::regex registrationDecisionPattern(
      R"(^/api/v1/admin/registrations/([0-9]+)/(approve|reject)$)");
  if (request.method == "POST") {
    std::smatch decisionMatch;
    if (std::regex_match(request.path, decisionMatch,
                         registrationDecisionPattern)) {
      if (user->role != "admin") {
        return jsonError(403, "forbidden", "Acesso exclusivo de administrador.");
      }
      if (!isJson(request)) {
        return jsonError(400, "invalid_content_type", "Envie JSON.");
      }
      const auto id = std::stoll(decisionMatch[1].str());
      const bool approve = decisionMatch[2].str() == "approve";
      const std::string note = trim(jsonString(request.body, "note").value_or(""));
      if (!approve && note.size() < 3) {
        return jsonError(400, "review_note_required",
                         "Informe o motivo da recusa.");
      }
      if (!database_.reviewRegistration(id, user->id, approve, note)) {
        return jsonError(404, "not_found",
                         "Solicitação pendente não encontrada.");
      }
      return jsonResponse(200, "{\"id\":" + std::to_string(id) +
                                   ",\"status\":\"" +
                                   (approve ? "approved" : "rejected") + "\"}");
    }
  }

  // A conclusão recebe dados estruturados e PDF em uma única operação
  // idempotente. O servidor deriva a identidade do cookie autenticado.
  if (request.method == "POST" && request.path == "/api/v1/submissions") {
    if (user->role != "student" && user->role != "admin") {
      return jsonError(403, "forbidden", "Somente aluno ou administrador pode concluir um caso.");
    }
    const auto clientId = multipartText(request, "clientSubmissionId");
    const auto report = multipartText(request, "report");
    const auto activityText = multipartText(request, "activityId");
    const auto file = multipartFile(request, "pdf");
    static const std::regex uuidPattern(
        R"(^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$)");
    if (!clientId || !std::regex_match(*clientId, uuidPattern) || !report || !file) {
      return jsonError(400, "invalid_submission",
                       "Envie clientSubmissionId UUID, report e arquivo PDF.");
    }
    if (file->mimeType != "application/pdf" ||
        lower(std::filesystem::path(file->filename).extension().string()) != ".pdf") {
      return jsonError(400, "invalid_pdf_type", "Envie exclusivamente um PDF.");
    }
    const auto embeddedReport = structuredReport(file->data);
    if (!embeddedReport || *embeddedReport != *report) {
      return jsonError(400, "pdf_report_mismatch",
                       "O relatório embutido no PDF não coincide com os dados enviados.");
    }
    std::optional<std::int64_t> activityId;
    if (activityText && !trim(*activityText).empty()) {
      try {
        std::size_t consumed = 0;
        const auto value = std::stoll(trim(*activityText), &consumed);
        if (consumed != trim(*activityText).size() || value <= 0) throw std::invalid_argument("activity");
        activityId = value;
      } catch (...) {
        return jsonError(400, "invalid_activity", "Identificador de atividade inválido.");
      }
    }
    try {
      const PlatformSubmissionResult result = database_.submitPlatform(
          *user, PlatformSubmissionInput{*clientId, activityId, file->filename,
                                         file->data, sha256Hex(file->data), *report});
      return jsonResponse(
          result.created ? 201 : 200,
          "{\"id\":" + std::to_string(result.id) +
              ",\"created\":" + (result.created ? "true" : "false") +
              ",\"status\":\"" + jsonEscape(result.reviewStatus) +
              "\",\"score\":{\"initial\":" + std::to_string(result.initialScore) +
              ",\"raw\":" + std::to_string(result.rawScore) +
              ",\"displayed\":" + std::to_string(result.displayedScore) + "}}");
    } catch (const std::domain_error&) {
      return jsonError(409, "idempotency_conflict",
                       "A chave já foi usada com conteúdo diferente.");
    } catch (const std::invalid_argument& error) {
      return jsonError(400, "invalid_submission", error.what());
    }
  }

  if (request.method == "POST" &&
      request.path == "/api/v1/submissions/import-pdf") {
    if (user->role != "teacher" && user->role != "admin") {
      return jsonError(403, "forbidden", "Acesso exclusivo de professor.");
    }
    const auto file = multipartFile(request);
    if (!file) {
      return jsonError(400, "invalid_multipart",
                       "Envie um único arquivo PDF no campo file.");
    }
    const auto extension =
        lower(std::filesystem::path(file->filename).extension().string());
    if (extension != ".pdf" || file->mimeType != "application/pdf") {
      return jsonError(400, "invalid_pdf_type",
                       "O arquivo deve ter extensão e tipo PDF.");
    }
    if (file->data.empty() || file->data.size() > 10 * 1024 * 1024) {
      return jsonError(413, "invalid_pdf_size",
                       "O relatório deve ter conteúdo e no máximo 10 MB.");
    }
    if (file->data.size() < 5 || file->data.compare(0, 5, "%PDF-") != 0) {
      return jsonError(400, "invalid_pdf_signature",
                       "O arquivo não possui assinatura PDF válida.");
    }

    const auto report = structuredReport(file->data);
    if (!report) {
      return jsonError(
          400, "unrecognized_report",
          "Este PDF não é um relatório reconhecido pelo Paciente Virtual.");
    }
    const auto reportType = jsonString(*report, "reportType");
    const auto schemaVersion = jsonInteger(*report, "schemaVersion");
    const auto studentId = jsonInteger(*report, "studentId");
    const auto caseId = jsonString(*report, "caseId");
    if (!reportType || *reportType != "patient-virtual-submission" ||
        !schemaVersion || *schemaVersion != 1 || !studentId || !caseId ||
        caseId->empty()) {
      return jsonError(400, "incompatible_report",
                       "A versão ou os campos do relatório são incompatíveis.");
    }

    const char* configured = std::getenv("DEVSPHERE_UPLOAD_DIR");
    const std::filesystem::path uploadRoot =
        configured ? configured : std::filesystem::path("data/uploads");
    std::filesystem::create_directories(uploadRoot);
    const std::string digest = sha256Hex(file->data);
    const auto storedFile = uploadRoot / (digest + ".pdf");
    const bool created = !std::filesystem::exists(storedFile);
    if (created) {
      std::ofstream output(storedFile, std::ios::binary);
      output.write(file->data.data(),
                   static_cast<std::streamsize>(file->data.size()));
      if (!output) {
        return jsonError(500, "storage_error",
                         "Não foi possível preservar o PDF original.");
      }
    }

    try {
      const auto submissionId = database_.importSubmissionPdf(
          user->id, *studentId, file->filename, storedFile.string(), digest,
          static_cast<std::int64_t>(file->data.size()), *report,
          std::to_string(*schemaVersion));
      return jsonResponse(
          201, "{\"id\":" + std::to_string(submissionId) +
                   ",\"status\":\"imported\"}");
    } catch (const std::invalid_argument& error) {
      if (created) std::filesystem::remove(storedFile);
      return jsonError(400, "invalid_report", error.what());
    } catch (...) {
      if (created) std::filesystem::remove(storedFile);
      throw;
    }
  }

  if (request.method == "GET" && request.path == "/api/v1/cases") {
    return jsonResponse(200, database_.listCases(user->role));
  }

  if (request.method == "GET" && request.path == "/api/v1/submissions") {
    return jsonResponse(200, database_.listSubmissions(*user));
  }

  static const std::regex submissionPdfPattern(
      R"(^/api/v1/submissions/([0-9]+)/pdf$)");
  if (request.method == "GET") {
    if (const auto id = pathId(request.path, submissionPdfPattern)) {
      const auto pdf = database_.getSubmissionPdf(*id, *user);
      if (!pdf) return jsonError(404, "not_found", "PDF não encontrado.");
      return HttpResponse{200,
                          {{"Content-Type", "application/pdf"},
                           {"Content-Disposition", "inline; filename=\"atendimento.pdf\""},
                           {"ETag", "\"" + pdf->sha256 + "\""},
                           {"Cache-Control", "private, no-store"}},
                          pdf->data};
    }
  }

  static const std::regex submissionPattern(R"(^/api/v1/submissions/([0-9]+)$)");
  if (request.method == "GET") {
    if (const auto id = pathId(request.path, submissionPattern)) {
      const auto submission = database_.getSubmission(*id, *user);
      if (!submission) return jsonError(404, "not_found", "Atendimento não encontrado.");
      return jsonResponse(200, *submission);
    }
  }

  static const std::regex feedbackCreatePattern(
      R"(^/api/v1/submissions/([0-9]+)/feedback$)");
  if (request.method == "POST") {
    if (const auto id = pathId(request.path, feedbackCreatePattern)) {
      if (user->role != "teacher" && user->role != "admin") {
        return jsonError(403, "forbidden", "Acesso exclusivo de professor.");
      }
      if (!database_.canTeacherReviewSubmission(*id, user->id)) {
        return jsonError(404, "not_found", "Atendimento não encontrado.");
      }
      if (!isJson(request)) {
        return jsonError(400, "invalid_content_type", "Envie JSON.");
      }
      const auto feedbackId =
          database_.createFeedback(*id, user->id, request.body);
      return jsonResponse(201, "{\"id\":" + std::to_string(feedbackId) +
                                   ",\"status\":\"draft\"}");
    }
  }

  static const std::regex feedbackPattern(R"(^/api/v1/feedback/([0-9]+)$)");
  if (request.method == "PUT") {
    if (const auto id = pathId(request.path, feedbackPattern)) {
      if (user->role != "teacher" && user->role != "admin") {
        return jsonError(403, "forbidden", "Acesso exclusivo de professor.");
      }
      if (!database_.updateFeedback(*id, user->id, request.body, false)) {
        return jsonError(404, "not_found", "Devolutiva não encontrada ou concluída.");
      }
      return jsonResponse(200, "{\"id\":" + std::to_string(*id) +
                                   ",\"status\":\"draft\"}");
    }
  }

  static const std::regex feedbackCompletePattern(
      R"(^/api/v1/feedback/([0-9]+)/complete$)");
  if (request.method == "POST") {
    if (const auto id = pathId(request.path, feedbackCompletePattern)) {
      if (user->role != "teacher" && user->role != "admin") {
        return jsonError(403, "forbidden", "Acesso exclusivo de professor.");
      }
      if (!database_.updateFeedback(*id, user->id, "{}", true)) {
        return jsonError(404, "not_found", "Devolutiva não encontrada ou concluída.");
      }
      return jsonResponse(200, "{\"id\":" + std::to_string(*id) +
                                   ",\"status\":\"completed\"}");
    }
  }

  static const std::regex studentFeedbackPattern(
      R"(^/api/v1/students/([0-9]+)/feedback$)");
  if (request.method == "GET") {
    if (const auto id = pathId(request.path, studentFeedbackPattern)) {
      if ((user->role == "teacher" || user->role == "admin") &&
          !database_.canTeacherReviewStudent(*id, user->id)) {
        return jsonError(404, "not_found", "Aluno não encontrado.");
      }
      if (user->role != "teacher" && user->role != "admin" && user->id != *id) {
        return jsonError(403, "forbidden", "Acesso não autorizado.");
      }
      return jsonResponse(200, database_.listFeedback(*id, *user));
    }
  }

  if (request.path.rfind("/api/v1/case-generation/", 0) == 0) {
    if (user->role != "teacher" && user->role != "admin") {
      return jsonError(403, "forbidden", "Acesso exclusivo de professor.");
    }
    return jsonError(501, "ai_not_configured",
                     "O provedor de IA ainda não foi configurado no backend.");
  }

  if (const auto file = staticFile(request)) return *file;
  return jsonError(404, "not_found", "Recurso não encontrado.");
}

void HttpServer::run() {
  const int listener = socket(AF_INET, SOCK_STREAM, 0);
  if (listener < 0) throw std::runtime_error("não foi possível criar o socket");
  int reuse = 1;
  setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(static_cast<std::uint16_t>(port_));
  if (inet_pton(AF_INET, host_.c_str(), &address.sin_addr) != 1) {
    close(listener);
    throw std::runtime_error("endereço de escuta inválido");
  }
  if (bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) <
      0) {
    const auto message = std::string("falha no bind: ") + std::strerror(errno);
    close(listener);
    throw std::runtime_error(message);
  }
  if (listen(listener, 32) < 0) {
    close(listener);
    throw std::runtime_error("falha ao iniciar escuta");
  }
  std::cout << "Devsphere API em http://" << host_ << ':' << port_ << '\n';

  while (true) {
    sockaddr_in clientAddress{};
    socklen_t clientSize = sizeof(clientAddress);
    const int client =
        accept(listener, reinterpret_cast<sockaddr*>(&clientAddress), &clientSize);
    if (client < 0) continue;
    char remote[INET_ADDRSTRLEN]{};
    inet_ntop(AF_INET, &clientAddress.sin_addr, remote, sizeof(remote));

    HttpResponse response;
    std::optional<HttpRequest> request;
    try {
      request = readRequest(client, remote);
      response = request ? route(*request)
                         : jsonError(400, "invalid_request", "Requisição inválida.");
    } catch (const std::exception& error) {
      std::cerr << "Erro de requisição: " << error.what() << '\n';
      response = jsonError(500, "internal_error", "Erro interno do servidor.");
    }
    if (request) applyCors(*request, response, production_);
    const auto serialized = serialize(response);
    send(client, serialized.data(), serialized.size(), 0);
    close(client);
  }
}

}  // namespace devsphere
