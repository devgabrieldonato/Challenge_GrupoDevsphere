import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import TextField from "../components/TextField";
import { roleHome, roleLabel, useAuth } from "../context/AuthContext";

const demo = {
  student: ["aluno.teste@devsphere.local", "Aluno@2026"],
  teacher: ["professor.teste@devsphere.local", "Prof@2026"],
  admin: ["admin@devsphere.local", "Admin@2026"],
};

export default function Login() {
  const { role } = useParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!roleLabel[role]) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Informe e-mail e senha."); return; }
    setBusy(true);
    try {
      await login(email, password, role);
      navigate(location.state?.from || roleHome[role], { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto grid max-w-3xl gap-6 md:grid-cols-5">
      <form onSubmit={submit} noValidate className="card space-y-4 md:col-span-3">
        <header>
          <p className="eyebrow">{roleLabel[role]}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl">Entrar</h1>
        </header>
        {location.state?.reason === "unauthorized" && (
          <p role="status" className="rounded-sm2 bg-warning-bg p-3 text-sm text-warning">Entre para acessar essa área.</p>
        )}
        <TextField label="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="rounded-sm2 bg-danger-bg p-3 text-sm font-semibold text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        {role !== "admin" && <p className="text-sm text-muted">Ainda não tem conta? <Link to={`/cadastro/${role}`}>Criar cadastro</Link></p>}
      </form>

      <aside className="rounded-md2 border border-line bg-info-bg p-5 text-sm md:col-span-2" aria-label="Conta de teste">
        <h2 className="text-base">Conta de teste</h2>
        <p className="mt-2 text-muted">Dados fictícios desta demonstração.</p>
        <dl className="mt-3 space-y-2">
          <div><dt className="font-semibold">E-mail</dt><dd className="break-all">{demo[role][0]}</dd></div>
          <div><dt className="font-semibold">Senha</dt><dd>{demo[role][1]}</dd></div>
        </dl>
        <button type="button" className="btn mt-4 w-full" onClick={() => { setEmail(demo[role][0]); setPassword(demo[role][1]); }}>
          Preencher automaticamente
        </button>
      </aside>
    </section>
  );
}
