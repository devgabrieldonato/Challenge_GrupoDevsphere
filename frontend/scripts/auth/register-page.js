// Valida o formulário no navegador e envia a solicitação ao backend.
import { AuthService } from "../services/auth-service.js";

const form = document.querySelector("#registerForm");
const status = document.querySelector("#formStatus");
const password = document.querySelector("#password");
const confirmation = document.querySelector("#passwordConfirmation");

document.querySelector("[data-toggle-password]")?.addEventListener("click", (event) => {
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  event.currentTarget.textContent = showing ? "Mostrar" : "Ocultar";
  event.currentTarget.setAttribute("aria-pressed", String(!showing));
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  confirmation.setCustomValidity(password.value === confirmation.value ? "" : "As senhas precisam ser iguais.");
  if (!form.reportValidity()) return;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  status.className = "status";
  status.textContent = "Enviando seu cadastro para análise…";
  try {
    await AuthService.register(form.dataset.role, {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      password: password.value,
      className: form.elements.className?.value.trim() || "",
      professionalRegistration: form.elements.professionalRegistration?.value.trim() || "",
    });
    status.className = "status success";
    status.textContent = "Cadastro enviado. Aguarde a aprovação da instituição antes de entrar.";
    form.reset();
    submit.textContent = "Cadastro enviado";
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message || "Não foi possível enviar o cadastro.";
    submit.disabled = false;
  }
});
