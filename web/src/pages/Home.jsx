import { Link } from "react-router-dom";

const roles = [
  { key: "student", kicker: "Aluno", n: "01", title: "Praticar o raciocínio clínico", text: "Investigue pacientes fictícios, conecte evidências e acompanhe sua evolução.", cta: "Entrar como aluno", primary: true },
  { key: "teacher", kicker: "Professor", n: "02", title: "Acompanhar cada decisão", text: "Revise o percurso dos alunos, prepare devolutivas e organize seus casos.", cta: "Entrar como professor" },
  { key: "admin", kicker: "Administrador", n: "03", title: "Organizar os acessos", text: "Gerencie solicitações e mantenha as jornadas disponíveis à comunidade acadêmica.", cta: "Entrar como administrador" },
];

export default function Home() {
  return (
    <>
      <section className="grid gap-6 lg:grid-cols-3 lg:items-end">
        <header className="lg:col-span-2">
          <p className="eyebrow">Ensino e prática clínica</p>
          <h1 className="mt-2">O raciocínio clínico começa com uma boa pergunta.</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">Um espaço para investigar, conectar evidências e aprender com cada decisão.</p>
        </header>
        <aside aria-label="Sobre a prática" className="rounded-md2 border border-line bg-info-bg p-5">
          <p className="eyebrow">O ambiente</p>
          <h2 className="mt-1 text-lg sm:text-xl">Aprendizagem com supervisão docente</h2>
          <p className="mt-2 text-sm text-muted">Cada atendimento registra escolhas, hipóteses e justificativas para revisão do professor.</p>
        </aside>
      </section>

      <section aria-label="Perfis de acesso" className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <article key={r.key} className="card flex flex-col">
            <div className="flex items-center justify-between">
              <span className="eyebrow">{r.kicker}</span>
              <span aria-hidden="true" className="text-2xl font-bold text-line">{r.n}</span>
            </div>
            <h2 className="mt-3 text-xl">{r.title}</h2>
            <p className="mt-2 flex-1 text-muted">{r.text}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to={`/login/${r.key}`} className={`btn ${r.primary ? "btn-primary" : ""}`}>{r.cta} <span aria-hidden="true">↗</span></Link>
              {r.key !== "admin" && <Link to={`/cadastro/${r.key}`} className="btn">Criar cadastro</Link>}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
