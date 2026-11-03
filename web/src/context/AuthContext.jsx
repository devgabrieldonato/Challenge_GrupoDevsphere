import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "../services/mockApi";

const AuthContext = createContext(null);
const SESSION_KEY = "pv-session";

const readSession = () => {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession);

  const login = useCallback(async (email, password, role) => {
    const logged = await api.login(email, password, role);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(logged)); } catch { /* ignora */ }
    setUser(logged);
    return logged;
  }, []);

  const logout = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignora */ }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

export const roleHome = { student: "/aluno/casos", teacher: "/professor", admin: "/admin" };
export const roleLabel = { student: "Aluno", teacher: "Professor", admin: "Administrador" };
