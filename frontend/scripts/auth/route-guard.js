// Protege páginas autenticadas sem persistir tokens no navegador.
import { AuthService } from "../services/auth-service.js";

const requiredRole = document.body.dataset.requiredRole;
const loginPage = requiredRole === "admin" ? "admin-login.html" : (requiredRole === "teacher" ? "teacher-login.html" : "student-login.html");

function redirect(reason) {
  const query = new URLSearchParams({ reason });
  window.location.replace(`${loginPage}?${query}`);
}

try {
  const session = await AuthService.session();
  if (session.user?.role !== requiredRole && session.user?.role !== "admin") {
    await AuthService.logout();
    redirect("unauthorized");
  } else {
    document.body.dataset.userId = String(session.user.id);
    document.body.dataset.userName = session.user.name || session.user.fullName || "";
    document.body.classList.remove("auth-pending");
    document.body.dataset.authenticated = "true";

    document.querySelector("[data-logout]")?.addEventListener("click", async () => {
      try {
        await AuthService.logout();
      } finally {
        window.location.assign("../index.html");
      }
    });
  }
} catch (error) {
  redirect(error.status === 401 ? "expired" : "unavailable");
}
