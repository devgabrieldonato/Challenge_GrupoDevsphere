import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AsyncState from "../components/AsyncState";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { api } from "../services/mockApi";

const tabs = [["question", "Perguntas"], ["exam", "Exames"]];
const typeStyle = { question: "bg-question-bg text-question", exam: "bg-exam-bg text-exam" };

function Result({ caso, result }) {
  const byId = Object.fromEntries(caso.items.map((i) => [i.id, i]));
  const revealed = result.revealedIds.map((id) => byId[id]);
  return (
    <section aria-labelledby="resultado" className="space-y-4">
      <div className={`rounded-md2 border p-5 ${result.correct ? "border-success bg-success-bg text-success" : "border-warning bg-warning-bg text-warning"}`}>
        <h2 id="resultado" tabIndex={-1} ref={(el) => el?.focus()}>
          {result.correct ? "Hipótese compatível com o desfecho" : "Hipótese diferente do desfecho"}
        </h2>
        <p className="mt-2 text-ink"><strong>Sua hipótese:</strong> {result.hypothesis}</p>
        <p className="text-ink"><strong>Desfecho do caso:</strong> {caso.outcome}</p>
      </div>
      <div className="card">
        <h3>Feedback pedagógico</h3>
        <p className="mt-2">{caso.feedback}</p>
        {caso.rationale && <p className="mt-2 text-muted">{caso.rationale}</p>}
      </div>
      <div className="card">
        <h3>Evidências prioritárias</h3>
        <ul className="mt-2 space-y-1">
          {caso.priorityIds.map((id) => (
            <li key={id}>
              <span aria-hidden="true">{result.priorityHit.includes(id) ? "✔" : "✖"}</span>{" "}
              {byId[id]?.title} — <span className="font-semibold">{result.priorityHit.includes(id) ? "você investigou" : "não investigado"}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>Seu percurso</h3>
        <ul className="mt-2 space-y-3">
          {revealed.map((i) => (
            <li key={i.id}><p className="font-semibold">{i.title} <span className="badge bg-surface-subtle text-muted">{i.quality}</span></p><p className="text-sm text-muted">{i.why}</p></li>
          ))}
        </ul>
      </div>
      {caso.references.length > 0 && (
        <div className="card">
          <h3>Referências</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {caso.references.map((r) => <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer">{r.label}</a></li>)}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link to="/aluno/historico" className="btn btn-primary">Ver histórico</Link>
        <Link to="/aluno/casos" className="btn">Escolher outro caso</Link>
      </div>
    </section>
  );
}

function Attendance({ caso }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("question");
  const [revealed, setRevealed] = useState([]);
  const [hypothesis, setHypothesis] = useState("");
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lastRef = useRef(null);

  if (result) return <Result caso={caso} result={result} />;

  const byId = Object.fromEntries(caso.items.map((i) => [i.id, i]));
  const reveal = (id) => { if (!revealed.includes(id)) setRevealed([...revealed, id]); };
  const canFinish = revealed.length > 0 && hypothesis;

  const finish = async () => {
    setSaving(true); setError("");
    try { setResult(await api.saveSubmission(user, { caseId: caso.id, revealedIds: revealed, hypothesis })); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="card overflow-hidden !p-0 sm:flex">
          <img src={`/${caso.image}`} alt={`Ilustração do paciente ${caso.name}`} width="900" height="600" className="aspect-[3/2] w-full object-cover sm:w-2/5" />
          <div className="p-5">
            <p className="eyebrow">Paciente</p>
            <h1 className="mt-1 text-2xl sm:text-3xl">{caso.title}</h1>
            <p className="mt-2">{caso.complaint}</p>
            {caso.context && <p className="mt-2 text-sm text-muted">{caso.context}</p>}
          </div>
        </section>

        <section className="card" aria-labelledby="investigar">
          <h2 id="investigar">Investigar</h2>
          <div role="group" aria-label="Tipo de investigação" className="mt-3 flex gap-2">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}
                className={`btn ${tab === key ? "btn-primary" : ""}`}>{label}</button>
            ))}
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {caso.items.filter((i) => i.type === tab).map((i) => {
              const done = revealed.includes(i.id);
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => reveal(i.id)} aria-disabled={done}
                    className={`btn w-full justify-start text-left ${done ? "!bg-selected !text-selected-ink" : ""}`}>
                    <span aria-hidden="true">{done ? "✔" : "+"}</span> {i.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="card" aria-labelledby="notas" aria-live="polite">
          <h2 id="notas" className="text-lg">Anotações do atendimento</h2>
          {revealed.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhuma investigação ainda. Escolha uma pergunta ou um exame.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {revealed.map((id, idx) => (
                <li key={id} ref={idx === revealed.length - 1 ? lastRef : null} className="rounded-sm2 bg-surface-subtle p-3">
                  <span className={`badge ${typeStyle[byId[id].type]}`}>{byId[id].type === "question" ? "Pergunta" : "Exame"}</span>
                  <p className="mt-1 text-sm font-semibold">{byId[id].title}</p>
                  <p className="mt-1 text-sm">{byId[id].answer}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card" aria-labelledby="hipotese">
          <h2 id="hipotese" className="text-lg">Hipótese principal</h2>
          <fieldset className="mt-3 space-y-2">
            <legend className="sr-only">Escolha a hipótese principal</legend>
            {caso.hypotheses.map((h) => (
              <label key={h} className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-sm2 border border-line p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-selected">
                <input type="radio" name="hipotese" value={h} checked={hypothesis === h} onChange={() => setHypothesis(h)} className="mt-1" />
                <span>{h}</span>
              </label>
            ))}
          </fieldset>
          {error && <p role="alert" className="mt-3 rounded-sm2 bg-danger-bg p-3 text-sm font-semibold text-danger">{error}</p>}
          <button type="button" className="btn btn-primary mt-4 w-full" disabled={!canFinish || saving} onClick={finish}>
            {saving ? "Salvando…" : "Concluir atendimento"}
          </button>
          {!canFinish && <p className="mt-2 text-xs text-muted">Faça ao menos uma investigação e escolha uma hipótese para concluir.</p>}
        </section>
      </aside>
    </div>
  );
}

export default function Session() {
  const { caseId } = useParams();
  const caso = useApi(() => api.getCase(caseId), [caseId]);
  return (
    <>
      <p className="mb-4"><Link to="/aluno/casos">← Voltar aos casos</Link></p>
      <AsyncState state={caso}>{(c) => <Attendance key={c.id} caso={c} />}</AsyncState>
    </>
  );
}
