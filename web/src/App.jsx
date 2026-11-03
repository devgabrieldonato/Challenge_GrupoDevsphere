import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { AccessDenied, NotFound } from "./pages/Messages";
import StudentCases from "./pages/StudentCases";
import Session from "./pages/Session";
import History from "./pages/History";
import TeacherDashboard from "./pages/TeacherDashboard";
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Rotas públicas */}
        <Route path="/" element={<Home />} />
        <Route path="/login/:role" element={<Login />} />
        <Route path="/cadastro/:role" element={<Register />} />
        <Route path="/acesso-negado" element={<AccessDenied />} />

        {/* Rotas privadas: aluno */}
        <Route element={<ProtectedRoute role="student" />}>
          <Route path="/aluno/casos" element={<StudentCases />} />
          <Route path="/aluno/casos/:caseId" element={<Session />} />
          <Route path="/aluno/historico" element={<History />} />
        </Route>

        {/* Rotas privadas: professor */}
        <Route element={<ProtectedRoute role="teacher" />}>
          <Route path="/professor" element={<TeacherDashboard />} />
        </Route>

        {/* Rotas privadas: administrador */}
        <Route element={<ProtectedRoute role="admin" />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
