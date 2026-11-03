import { render, screen, waitFor, renderHook, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import ProtectedRoute from "../components/ProtectedRoute";
import { AuthProvider } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { api, resetDb } from "../services/mockApi";

beforeEach(() => { resetDb(); sessionStorage.clear(); });

const renderRoutes = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login/:role" element={<p>tela de login</p>} />
          <Route path="/acesso-negado" element={<p>acesso negado</p>} />
          <Route element={<ProtectedRoute role="teacher" />}>
            <Route path="/professor" element={<p>painel do professor</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("rotas privadas", () => {
  it("redireciona visitante para o login", () => {
    renderRoutes("/professor");
    expect(screen.getByText("tela de login")).toBeInTheDocument();
  });

  it("bloqueia aluno na área do professor", () => {
    sessionStorage.setItem("pv-session", JSON.stringify({ id: 2, name: "Aluno", role: "student" }));
    renderRoutes("/professor");
    expect(screen.getByText("acesso negado")).toBeInTheDocument();
  });

  it("permite professor e administrador", () => {
    sessionStorage.setItem("pv-session", JSON.stringify({ id: 1, name: "Admin", role: "admin" }));
    renderRoutes("/professor");
    expect(screen.getByText("painel do professor")).toBeInTheDocument();
  });
});

describe("useApi", () => {
  it("retorna success, empty e error", async () => {
    const ok = renderHook(() => useApi(() => Promise.resolve([1]), []));
    await waitFor(() => expect(ok.result.current.status).toBe("success"));

    const empty = renderHook(() => useApi(() => Promise.resolve([]), []));
    await waitFor(() => expect(empty.result.current.status).toBe("empty"));

    const fail = renderHook(() => useApi(() => Promise.reject(new Error("falhou")), []));
    await waitFor(() => expect(fail.result.current.status).toBe("error"));
    act(() => fail.result.current.retry());
    await waitFor(() => expect(fail.result.current.status).toBe("error"));
  });
});

describe("API mockada", () => {
  it("rejeita senha errada e cadastro pendente", async () => {
    await expect(api.login("aluno.teste@devsphere.local", "errada", "student")).rejects.toMatchObject({ status: 401 });
    await expect(api.login("pendente@devsphere.local", "Pendente@2026", "student")).rejects.toMatchObject({ status: 403 });
  });

  it("faz login sem expor a senha", async () => {
    const user = await api.login("aluno.teste@devsphere.local", "Aluno@2026", "student");
    expect(user.role).toBe("student");
    expect(user.password).toBeUndefined();
  });

  it("registra atendimento e avalia hipótese", async () => {
    const caso = await api.getCase("joao");
    const user = { id: 2, name: "Aluno Teste" };
    const sub = await api.saveSubmission(user, { caseId: "joao", revealedIds: ["vitals"], hypothesis: caso.correctHypothesis });
    expect(sub.correct).toBe(true);
    expect(sub.priorityMissed).toContain("ecg");
    expect(await api.listSubmissions(2)).toHaveLength(1);
  });

  it("caso inexistente gera erro 404", async () => {
    await expect(api.getCase("nao-existe")).rejects.toMatchObject({ status: 404 });
  });
});
