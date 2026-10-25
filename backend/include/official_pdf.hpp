#pragma once
#include <string>
namespace devsphere {
// Renderiza em subprocesso com limites; falha impede salvar documento não
// oficial.
std::string renderOfficialPdf(const std::string &reportJson);
} // namespace devsphere
