#pragma once
#include "http_server.hpp"
namespace devsphere {
// Rotas autenticadas da biblioteca e fila. O worker processa fora do request.
std::optional<HttpResponse> pipelineRoute(const HttpRequest &,
                                          const SessionUser &);
} // namespace devsphere
