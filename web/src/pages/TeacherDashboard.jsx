import { useState } from "react";
import AsyncState from "../components/AsyncState";
import TextField from "../components/TextField";
import { useApi } from "../hooks/useApi";
import { api } from "../services/mockApi";
import { formatDate } from "./History";

function FeedbackForm({ submission, onSaved }) {
  const [text, setText] = useState(submission.teacherFeedback || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const save = async (event) => {
    event.preventDefault();
    if (!text.trim()) { setMsg({ type: "error", text: "Escreva a devolutiva antes de salvar." }); return; }
    setBusy(true);
    try { await api.saveFeedback(submission.id, text); setMsg({ type: "ok", text: "Devolutiva salva." }); onSaved(); }
    catch (e) { setMsg({ type: "error", text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="mt-3 space-y-2">
      <TextField multiline rows={3} label="Devolutiva para o aluno" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar devolutiva"}</button>
        {msg.text && <p role={msg.type === "error" ? "alert" : "status"} className={`text-sm font-semibold ${msg.type === "error" ? "text-danger" : "text-success"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}

export default function TeacherDashboard() {
  const cases = useApi(() => api.listCases(), []);
  const submissions = useApi(() => api.listAllSubmissions(), []);
  return (
    <>
      <header>
        <p className="eyebrow">Professor</p>
        <h1 className="mt-1">Painel do professor</h1>
      </header>

      <section className="mt-8" aria-labelledby="casos">
        <h2 id="casos">Casos publicados</h2>
        <div className="mt-4">
          <AsyncState state={cases} emptyTitle="Nenhum caso cadastrado.">
            {(list) => (
              <ul className="grid gap-4 sm:grid-cols-2">
                {list.map((c) => (
                  <li key={c.id} className="card">
                    <h3>{c.title}</h3>
                    <p className="mt-1 text-sm text-muted">{c.items.length} itens de investigação · {c.hypotheses.length} hipóteses</p>
                    <p className="mt-2 text-sm"><strong>Desfecho:</strong> {c.outcome}</p>
                  </li>
                ))}
              </ul>
            )}
          </AsyncState>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="revisao">
        <h2 id="revisao">Atendimentos para revisão</h2>
        <div className="mt-4">
          <AsyncState state={submissions} emptyTitle="Nenhum atendimento concluído pelos alunos ainda.">
            {(list) => (
              <ul className="space-y-4">
                {list.map((s) => (
                  <li key={s.id} className="card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3>{s.userName} · {s.caseTitle}</h3>
                      <span className={`badge ${s.teacherFeedback ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}>
                        {s.teacherFeedback ? "Devolutiva enviada" : "Aguardando revisão"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{formatDate(s.createdAt)} · {s.revealedIds.length} investigações</p>
                    <p className="mt-2"><strong>Hipótese:</strong> {s.hypothesis} {s.correct ? "(compatível)" : "(diferente do desfecho)"}</p>
                    <FeedbackForm submission={s} onSaved={submissions.retry} />
                  </li>
                ))}
              </ul>
            )}
          </AsyncState>
        </div>
      </section>
    </>
  );
}
