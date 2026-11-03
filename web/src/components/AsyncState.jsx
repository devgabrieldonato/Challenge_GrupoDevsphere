/**
 * Renderiza os estados de uma chamada feita com useApi:
 * carregando, erro (com "Tentar novamente"), vazio e sucesso.
 */
export default function AsyncState({ state, emptyTitle = "Nada por aqui ainda", emptyAction = null, children }) {
  if (state.status === "loading") {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-md2 border border-line bg-surface p-6 text-muted">
        <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" />
        Carregando…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-md2 border border-danger bg-danger-bg p-5 text-danger">
        <p className="font-semibold">Não foi possível carregar.</p>
        <p className="mt-1 text-sm">{state.error?.message || "Erro inesperado."}</p>
        <button type="button" className="btn mt-4" onClick={state.retry}>Tentar novamente</button>
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="rounded-md2 border border-dashed border-control bg-surface p-8 text-center">
        <p className="font-semibold">{emptyTitle}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }
  return children(state.data);
}
