// Controla o formulário de login, a visibilidade da senha e os estados acessíveis.
import { AuthService } from "../services/auth-service.js";
const form = document.querySelector("#loginForm");
const status = document.querySelector("#formStatus");
const password = document.querySelector("#password");
const reason = new URLSearchParams(window.location.search).get("reason");
if (reason === "expired") {
  status.className = "status warning";
  status.textContent = "Sua sessão expirou. Entre novamente para continuar.";
} else if (reason === "unauthorized") {
  status.className = "status error";
  status.textContent = "Este perfil não tem acesso à página solicitada.";
} else if (reason === "unavailable") {
  status.className = "status error";
  status.textContent = "Não foi possível verificar sua sessão. Tente novamente.";
}
document.querySelector("[data-toggle-password]")?.addEventListener("click", (event) => {
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  event.currentTarget.textContent = showing ? "Mostrar" : "Ocultar";
  event.currentTarget.setAttribute("aria-pressed", String(!showing));
});
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  status.className = "status";
  status.textContent = "Verificando suas credenciais…";
  try {
    const result = await AuthService.login(form.email.value.trim(), form.password.value, form.dataset.role);
    if (result.user?.role && result.user.role !== form.dataset.role && result.user.role !== "admin") {
      await AuthService.logout();
      throw new Error("Este acesso pertence a outro perfil.");
    }
    window.location.assign(form.dataset.successUrl);
  } catch (error) {
    status.className = "status error";
    status.textContent = error.status === 401 ? "E-mail ou senha inválidos." : (error.message || "Não foi possível entrar. Tente novamente.");
    password.focus();
  } finally { submit.disabled = false; }
});
