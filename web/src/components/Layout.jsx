import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { roleLabel, useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";

const navByRole = {
  student: [["/aluno/casos", "Casos"], ["/aluno/historico", "Histórico"]],
  teacher: [["/professor", "Painel do professor"]],
  admin: [["/admin", "Administração"], ["/aluno/casos", "Área do aluno"], ["/professor", "Área do professor"]],
};

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" className="btn" onClick={toggle} aria-pressed={dark}>
      <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
      <span>{dark ? "Tema claro" : "Tema escuro"}</span>
    </button>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef(null);

  // A cada troca de rota, leva o foco ao conteúdo (leitores de tela e teclado).
  useEffect(() => { mainRef.current?.focus(); }, [location.pathname]);

  const sair = () => { logout(); navigate("/"); };

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm2 focus:bg-surface focus:px-4 focus:py-2">
        Ir para o conteúdo
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3 no-underline hover:no-underline">
            <img src="/brand/fiap.png" alt="FIAP" width="40" height="40" className="h-9 w-9 object-contain sm:h-10 sm:w-10" />
            <span aria-hidden="true" className="text-muted">+</span>
            <img src="/brand/moinhos_de_vento.png" alt="Faculdade Moinhos de Vento" width="86" height="40" className="h-9 w-auto object-contain sm:h-10" />
            <span className="ml-1 text-base font-bold text-ink sm:text-lg">Paciente Virtual</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {user && (
              <nav aria-label="Principal" className="flex flex-wrap gap-1">
                {navByRole[user.role].map(([to, label]) => (
                  <NavLink key={to} to={to} className={({ isActive }) =>
                    `rounded-sm2 px-3 py-2 text-sm font-semibold no-underline hover:no-underline ${isActive ? "bg-selected text-selected-ink" : "text-ink hover:bg-surface-subtle"}`}>
                    {label}
                  </NavLink>
                ))}
              </nav>
            )}
            <ThemeToggle />
            {user && (
              <>
                <span className="hidden text-sm text-muted md:inline">{user.name} · {roleLabel[user.role]}</span>
                <button type="button" className="btn" onClick={sair}>Sair</button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="conteudo" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface px-4 py-5 text-center text-sm text-muted">
        © 2026 Paciente Virtual · Ambiente educacional · Casos fictícios sujeitos à validação docente
      </footer>
    </div>
  );
}
