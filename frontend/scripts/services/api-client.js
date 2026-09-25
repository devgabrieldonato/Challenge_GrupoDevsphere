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
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Não foi possível concluir a solicitação.";
    if (response.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new CustomEvent("session-expired"));
    throw new ApiError(message, response.status, payload);
  }
  return payload?.data ?? payload;
}
