// Cliente HTTP centralizado: envia cookies de sessão e normaliza respostas/erros da API.
const liveServerHosts = new Set(["127.0.0.1", "localhost"]);
const runningOnLiveServer = liveServerHosts.has(window.location.hostname) && window.location.port === "5501";
const apiHostname = window.location.hostname === "localhost" ? "localhost" : "127.0.0.1";
const API_BASE = runningOnLiveServer ? `http://${apiHostname}:8080/api/v1` : "/api/v1";
export class ApiError extends Error {
  constructor(message, status, details = null) { super(message); this.name = "ApiError"; this.status = status; this.details = details; }
}
export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response;

  // Erros de rede não possuem resposta HTTP. No desenvolvimento local, isso
  // normalmente significa que o Live Server abriu o frontend, mas a API C++
  // ainda não está escutando na porta 8080.
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  } catch {
    throw new ApiError(
      runningOnLiveServer
        ? "A API local está indisponível. Aguarde a tarefa 'Devsphere: API local (8080)' iniciar e tente novamente."
        : "Não foi possível alcançar o servidor. Verifique se a API está em execução.",
      0,
      { code: "network_error" },
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Não foi possível concluir a solicitação.";
    if (response.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new CustomEvent("session-expired"));
    throw new ApiError(message, response.status, payload);
  }
  return payload?.data ?? payload;
}
