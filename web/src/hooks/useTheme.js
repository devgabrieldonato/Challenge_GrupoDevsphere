import { useCallback, useEffect, useState } from "react";

const read = () => document.documentElement.dataset.theme === "dark" ? "dark" : "light";

/** Alterna tema claro/escuro e lembra a preferência. */
export function useTheme() {
  const [theme, setTheme] = useState(read);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pv-theme", theme); } catch { /* ignora */ }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}
