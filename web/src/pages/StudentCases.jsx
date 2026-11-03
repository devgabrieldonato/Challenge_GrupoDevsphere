import { Link } from "react-router-dom";
import AsyncState from "../components/AsyncState";
import { useApi } from "../hooks/useApi";
import { api } from "../services/mockApi";

export default function StudentCases() {
  const cases = useApi(() => api.listCases(), []);
  return (
    <>
      <header>
        <p className="eyebrow">Aluno</p>
        <h1 className="mt-1">Escolha um paciente</h1>
        <p className="mt-2 text-muted">Cada caso é fictício e foi preparado para treinar a investigação clínica.</p>
      </header>
      <div className="mt-6">
        <AsyncState state={cases} emptyTitle="Nenhum caso publicado no momento.">
          {(list) => (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <li key={c.id} className="card flex flex-col overflow-hidden !p-0">
                  <img src={`/${c.image}`} alt={`Ilustração do paciente ${c.name}`} width="900" height="600" loading="lazy" className="aspect-[3/2] w-full object-cover" />
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-xl">{c.title}</h2>
                    <p className="mt-2 flex-1 text-muted">{c.complaint}</p>
                    <Link to={`/aluno/casos/${c.id}`} className="btn btn-primary mt-4">Iniciar atendimento</Link>
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
