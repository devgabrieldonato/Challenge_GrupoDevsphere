import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import TextField from "../components/TextField";
import { roleLabel } from "../context/AuthContext";
import { api } from "../services/mockApi";

export default function Register() {
  const { role } = useParams();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (role !== "student" && role !== "teacher") return <Navigate to="/" replace />;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 3) next.name = "Informe o nome completo.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Informe um e-mail válido.";
    if (form.password.length < 8) next.password = "A senha precisa ter ao menos 8 caracteres.";
    return next;
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api.register({ ...form, role });
      setDone(true);
    } catch (e) {
      setErrors({ form: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section role="status" className="card mx-auto max-w-xl text-center">
        <h1 className="text-2xl">Cadastro enviado</h1>
        <p className="mt-3 text-muted">O administrador precisa validar seu cadastro antes do primeiro acesso.</p>
        <Link to={`/login/${role}`} className="btn btn-primary mt-6">Ir para o login</Link>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="card mx-auto max-w-xl space-y-4">
      <header>
        <p className="eyebrow">{roleLabel[role]}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl">Criar cadastro</h1>
      </header>
      <TextField label="Nome completo" autoComplete="name" value={form.name} onChange={set("name")} error={errors.name} />
      <TextField label="E-mail institucional" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} />
      <TextField label="Senha" type="password" autoComplete="new-password" hint="Mínimo de 8 caracteres." value={form.password} onChange={set("password")} error={errors.password} />
      {errors.form && <p role="alert" className="rounded-sm2 bg-danger-bg p-3 text-sm font-semibold text-danger">{errors.form}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Enviando…" : "Enviar cadastro"}</button>
      <p className="text-sm text-muted">Já tem conta? <Link to={`/login/${role}`}>Entrar</Link></p>
    </form>
  );
}
