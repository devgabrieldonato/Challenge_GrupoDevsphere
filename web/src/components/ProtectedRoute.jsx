import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Rota privada. Sem login, redireciona para a tela de entrada do perfil esperado.
 * Com login mas sem permissão, redireciona para "acesso negado".
 * O administrador pode acessar todas as áreas (igual ao backend da Sprint 3).
 */
export default function ProtectedRoute({ role }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to={`/login/${role}`} replace state={{ from: location.pathname, reason: "unauthorized" }} />;
  }
  if (user.role !== role && user.role !== "admin") {
    return <Navigate to="/acesso-negado" replace />;
  }
  return <Outlet />;
}
