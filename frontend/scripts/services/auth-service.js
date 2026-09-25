import { apiRequest } from "./api-client.js";
// A sessão é mantida pelo backend em cookie HttpOnly; nenhuma credencial é persistida no navegador.
export const AuthService = {
  login(email, password, expectedRole) { return apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email, password, expectedRole }) }); },
  register(role, data) { return apiRequest(`/auth/register/${role}`, { method: "POST", body: JSON.stringify(data) }); },
  logout() { return apiRequest("/auth/logout", { method: "POST" }); },
  session() { return apiRequest("/auth/session"); },
};
