import { Link } from "react-router-dom";

function Message({ title, text }) {
  return (
    <section className="card mx-auto max-w-xl text-center">
      <h1>{title}</h1>
      <p className="mt-3 text-muted">{text}</p>
      <Link to="/" className="btn btn-primary mt-6">Voltar ao início</Link>
    </section>
  );
}

export const AccessDenied = () => (
  <Message title="Acesso negado" text="Seu perfil não tem permissão para abrir esta área. Entre com o perfil correto." />
);
export const NotFound = () => (
  <Message title="Página não encontrada" text="O endereço não existe ou foi movido." />
);
