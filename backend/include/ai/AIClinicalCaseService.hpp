#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace paciente_virtual::ai {

// Mantém o conteúdo clínico proposto separado da decisão editorial do professor.
enum class ReviewState {
  Draft,
  AwaitingHumanReview,
  ChangesRequested,
  Approved,
  Rejected
};

struct GenerationContext {
  std::string requester_id;
  std::string prompt_version;
  std::string provider_model;
  std::string source_document_id;
};

struct GenerationResult {
  std::string job_id;
  std::string case_json;
  std::vector<std::string> assumptions;
  std::vector<std::string> missing_data;
  std::vector<std::string> validation_errors;
  ReviewState review_state{ReviewState::Draft};
};

struct ExtractedClinicalContent {
  std::string markdown;
  std::vector<std::string> warnings;
  bool requires_ocr{false};
};

// Contrato da futura integração. Implementações concretas vivem no backend e
// nunca recebem chaves ou credenciais do navegador.
class AIClinicalCaseService {
 public:
  virtual ~AIClinicalCaseService() = default;

  virtual GenerationResult GenerateCaseFromStructuredInput(
      const std::string& structured_input_json,
      const GenerationContext& context) = 0;

  virtual ExtractedClinicalContent ExtractClinicalContentFromPdf(
      const std::filesystem::path& quarantined_pdf,
      const GenerationContext& context) = 0;

  virtual GenerationResult GenerateCaseFromExtractedContent(
      const ExtractedClinicalContent& content,
      const GenerationContext& context) = 0;

  virtual std::vector<std::string> ValidateGeneratedCase(
      const std::string& case_json) const = 0;

  virtual std::vector<std::string> ListAssumptionsAndMissingData(
      const std::string& case_json) const = 0;
};

}  // namespace paciente_virtual::ai
