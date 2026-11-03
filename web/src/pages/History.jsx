import { Link } from "react-router-dom";
import AsyncState from "../components/AsyncState";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { api } from "../services/mockApi";

export const formatDate = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function History() {
  const { user } = useAuth();
  const list = useApi(() => api.listSubmissions(user.id), [user.id]);
  return (
    <>
      <header>
        <p className="eyebrow">Aluno</p>
        <h1 className="mt-1">Meu histórico</h1>
      </header>
      <div className="mt-6">
        <AsyncState state={list} emptyTitle="Você ainda não concluiu nenhum atendimento."
          emptyAction={<Link to="/aluno/casos" className="btn btn-primary">Escolher um caso</Link>}>
          {(items) => (
            <ul className="space-y-4">
              {items.map((s) => (
                <li key={s.id} className="card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg">{s.caseTitle}</h2>
                    <span className={`badge ${s.correct ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}>
                      {s.correct ? "Hipótese compatível" : "Hipótese diferente do desfecho"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{formatDate(s.createdAt)} · {s.revealedIds.length} investigações</p>
                  <p className="mt-2"><strong>Hipótese:</strong> {s.hypothesis}</p>
                  <div className="mt-3 rounded-sm2 bg-surface-subtle p-3 text-sm">
                    <strong>Devolutiva do professor:</strong>{" "}
                    {s.teacherFeedback || <span className="text-muted">aguardando revisão.</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AsyncState>
      </div>
    </>
  );
}
