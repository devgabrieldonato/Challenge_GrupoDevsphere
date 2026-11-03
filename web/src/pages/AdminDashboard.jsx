import { useState } from "react";
import AsyncState from "../components/AsyncState";
import { roleLabel } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { api } from "../services/mockApi";

const statusLabel = { active: "Ativo", pending: "Pendente", blocked: "Bloqueado" };
const statusStyle = { active: "bg-success-bg text-success", pending: "bg-warning-bg text-warning", blocked: "bg-danger-bg text-danger" };

export default function AdminDashboard() {
  const users = useApi(() => api.listUsers(), []);
  const [error, setError] = useState("");

  const change = async (id, status) => {
    setError("");
    try { await api.setUserStatus(id, status); users.retry(); } catch (e) { setError(e.message); }
  };

  return (
    <>
      <header>
        <p className="eyebrow">Administrador</p>
        <h1 className="mt-1">Acessos e cadastros</h1>
        <p className="mt-2 text-muted">Valide cadastros pendentes e controle quem pode entrar.</p>
      </header>
      {error && <p role="alert" className="mt-4 rounded-sm2 bg-danger-bg p-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-6">
        <AsyncState state={users} emptyTitle="Nenhum usuário cadastrado.">
          {(list) => (
            <div className="overflow-x-auto rounded-md2 border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Usuários cadastrados</caption>
                <thead className="bg-surface-subtle">
                  <tr><th scope="col" className="p-3">Nome</th><th scope="col" className="p-3">E-mail</th><th scope="col" className="p-3">Perfil</th><th scope="col" className="p-3">Situação</th><th scope="col" className="p-3">Ação</th></tr>
                </thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id} className="border-t border-line">
                      <th scope="row" className="p-3 font-semibold">{u.name}</th>
                      <td className="p-3 break-all">{u.email}</td>
                      <td className="p-3">{roleLabel[u.role]}</td>
                      <td className="p-3"><span className={`badge ${statusStyle[u.status]}`}>{statusLabel[u.status]}</span></td>
                      <td className="p-3">
                        {u.role === "admin" ? <span className="text-muted">—</span> : u.status === "active" ? (
                          <button type="button" className="btn btn-danger" onClick={() => change(u.id, "blocked")}>Bloquear</button>
                        ) : (
                          <button type="button" className="btn btn-primary" onClick={() => change(u.id, "active")}>{u.status === "pending" ? "Aprovar" : "Reativar"}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncState>
      </div>
    </>
  );
}
