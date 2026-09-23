#pragma once

#include <cstdint>
#include <optional>
#include <string>

struct sqlite3;

namespace devsphere {

struct User {
  std::int64_t id{};
  std::string fullName;
  std::string email;
  std::string passwordHash;
  std::string role;
  bool active{};
};

struct SessionUser {
  std::int64_t id{};
  std::string fullName;
  std::string email;
  std::string role;
};

class Database {
 public:
  explicit Database(const std::string& path);
  ~Database();
  Database(const Database&) = delete;
  Database& operator=(const Database&) = delete;

  void migrate(const std::string& migrationsDirectory);
  std::optional<User> findUserByEmail(const std::string& email);
  void createUser(const std::string& fullName, const std::string& email,
                  const std::string& passwordHash, const std::string& role);
  void createAdmin(const std::string& fullName, const std::string& email,
                   const std::string& passwordHash,
                   const std::string& notificationEmail);
  void addInstitutionalDomain(const std::string& domain);
  bool isInstitutionalEmailAllowed(const std::string& email);
  std::int64_t createRegistration(const std::string& fullName,
                                  const std::string& email,
                                  const std::string& passwordHash,
                                  const std::string& role,
                                  const std::string& className,
                                  const std::string& professionalRegistration);
  std::string listPendingRegistrations();
  std::string adminConfiguration();
  bool reviewRegistration(std::int64_t requestId, std::int64_t adminId,
                          bool approve, const std::string& note);
  void recordLogin(std::int64_t userId);
  void createSession(std::int64_t userId, const std::string& tokenHash,
                     const std::string& expiresAt);
  std::optional<SessionUser> findSession(const std::string& tokenHash);
  void deleteSession(const std::string& tokenHash);
  void purgeExpiredSessions();

  std::string listCases(const std::string& role);
  std::int64_t importSubmissionPdf(std::int64_t teacherId,
                                   std::int64_t studentId,
                                   const std::string& originalName,
                                   const std::string& storedPath,
                                   const std::string& sha256,
                                   std::int64_t byteSize,
                                   const std::string& reportJson,
                                   const std::string& schemaVersion);
  std::string listSubmissions(const SessionUser& user);
  std::optional<std::string> getSubmission(std::int64_t id,
                                           const SessionUser& user);
  bool canTeacherReviewSubmission(std::int64_t submissionId,
                                  std::int64_t teacherId);
  bool canTeacherReviewStudent(std::int64_t studentId,
                               std::int64_t teacherId);
  std::string listFeedback(std::int64_t studentId, const SessionUser& user);
  std::int64_t createFeedback(std::int64_t submissionId,
                              std::int64_t teacherId,
                              const std::string& jsonBody);
  bool updateFeedback(std::int64_t feedbackId, std::int64_t teacherId,
                      const std::string& jsonBody, bool complete);

 private:
  sqlite3* db_{};
  void execute(const std::string& sql);
};

}  // namespace devsphere
