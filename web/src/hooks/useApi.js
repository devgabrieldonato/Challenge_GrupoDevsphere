import { useCallback, useEffect, useState } from "react";

/**
 * Hook customizado: executa uma chamada assíncrona e expõe os 4 estados da tela
 * ("loading", "success", "empty" e "error"), mais "retry" para tentar de novo.
 * Mantém a lógica de requisição fora dos componentes visuais.
 */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true; // evita atualizar estado depois que o componente saiu da tela
    setState((previous) => ({ ...previous, status: "loading", error: null }));
    fetcher()
      .then((data) => {
        if (!active) return;
        const empty = Array.isArray(data) && data.length === 0;
        setState({ status: empty ? "empty" : "success", data, error: null });
      })
      .catch((error) => {
        if (active) setState({ status: "error", data: null, error });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
