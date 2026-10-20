// Tema visual local: nunca guarda credenciais nem altera dados da sessão.
// Executa antes do CSS para aplicar a preferência sem piscar um fundo branco.
(() => {
  const key = "pacientevirtual.theme";
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = null;
  function readPreference() {
    try {
      const saved = localStorage.getItem(key);
      return saved === "dark" || saved === "light" ? saved : null;
    } catch { return null; } // A troca continua funcional se o armazenamento estiver bloqueado.
  }
  function apply() {
    const dark = (preference || (system.matches ? "dark" : "light")) === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
      toggle.hidden = false;
      toggle.title = dark ? "Usar tema claro" : "Usar tema escuro";
      toggle.setAttribute("aria-pressed", String(dark));
    }
  }
  preference = readPreference();
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("themeToggle");
    toggle?.addEventListener("click", () => {
      preference = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(key, preference); } catch { /* Preferência em memória nesta página. */ }
      apply();
    });
    apply();
  }, { once: true });
  // Mudanças do sistema só prevalecem enquanto o usuário não escolheu um tema.
  system.addEventListener("change", () => { if (!preference) apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) { preference = readPreference(); apply(); }
  });
})();
