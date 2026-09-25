#pragma once

#include "database.hpp"
#include "security.hpp"

#include <map>
#include <optional>
#include <string>

namespace devsphere {

struct HttpRequest {
  std::string method;
  std::string path;
  std::map<std::string, std::string> headers;
  std::string body;
  std::string remoteAddress;
};

struct HttpResponse {
  int status{200};
  std::map<std::string, std::string> headers{
      {"Content-Type", "application/json; charset=utf-8"}};
  std::string body{"{}"};
};

class HttpServer {
 public:
  HttpServer(Database& database, std::string host, int port, bool production);
  void run();

 private:
  Database& database_;
  std::string host_;
  int port_;
  bool production_;
  LoginRateLimiter limiter_;

  HttpResponse route(const HttpRequest& request);
  std::optional<SessionUser> authenticate(const HttpRequest& request);
};

}  // namespace devsphere
