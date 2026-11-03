// API mockada: reproduz no navegador os fluxos que o backend C++ atende localmente.
// Os dados ficam em localStorage (com fallback em memória). Nenhum dado real é usado.
import seedCases from "../data/cases.json";

const KEY = "pv-mock-db-v1";
const LATENCY = import.meta.env.MODE === "test" ? 0 : 350;

export class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const seedUsers = [
  { id: 1, name: "Administrador Teste", email: "admin@devsphere.local", password: "Admin@2026", role: "admin", status: "active" },
  { id: 2, name: "Aluno Teste", email: "aluno.teste@devsphere.local", password: "Aluno@2026", role: "student", status: "active" },
  { id: 3, name: "Professor Teste", email: "professor.teste@devsphere.local", password: "Prof@2026", role: "teacher", status: "active" },
  { id: 4, name: "Aluno Pendente", email: "pendente@devsphere.local", password: "Pendente@2026", role: "student", status: "pending" },
];

let memoryDb = null;
const freshDb = () => ({ users: structuredClone(seedUsers), submissions: [], nextId: 100 });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* armazenamento indisponível: usa memória */ }
  if (!memoryDb) memoryDb = freshDb();
  return memoryDb;
}
function save(db) {
  memoryDb = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignora */ }
}
export function resetDb() {
  memoryDb = null;
  try { localStorage.removeItem(KEY); } catch { /* ignora */ }
}
const db = () => { const d = load(); if (!d.users) { const f = freshDb(); save(f); return f; } return d; };

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY));

// "?simularErro" na URL força falha nas leituras, para demonstrar o estado de erro.
async function run(fn, { readOnly = false } = {}) {
  await wait();
  if (readOnly && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("simularErro")) {
    throw new ApiError("Falha simulada de rede. Tente novamente.", 503);
  }
  return fn();
}

const publicUser = ({ password, ...rest }) => rest;

function normalizeCase(c) {
  return {
    id: c.id,
    name: c.name,
    age: c.age,
    title: c.caseLabel || `${c.name}, ${c.age} anos`,
    complaint: c.chiefComplaint || c.complaint,
    context: c.context || c.onset || "",
    image: `images/${c.id}-atendimento.webp`,
    hypotheses: c.hypotheses,
    correctHypothesis: c.correctHypothesis,
    priorityIds: c.priorityEvidenceIds || c.priorityIds || [],
    outcome: c.outcome,
    feedback: c.pedagogicalFeedback || c.clinicalGuidance || c.urgentGuidance || "",
    rationale: c.evidenceSummary || c.rationale || "",
    objectives: c.learningObjectives || [],
    references: c.references || [],
    items: c.items,
  };
}

export const api = {
  login: (email, password, role) =>
    run(() => {
      const user = db().users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!user || user.password !== password) throw new ApiError("E-mail ou senha incorretos.", 401);
      if (user.status === "pending") throw new ApiError("Seu cadastro aguarda a validação do administrador.", 403);
      if (user.status === "blocked") throw new ApiError("Seu acesso está bloqueado. Procure o administrador.", 403);
      if (user.role !== role && user.role !== "admin") throw new ApiError("Este perfil não tem acesso a esta área.", 403);
      return publicUser(user);
    }),

  register: ({ name, email, password, role }) =>
    run(() => {
      const d = db();
      if (d.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase()))
        throw new ApiError("Já existe um cadastro com este e-mail.", 409);
      const user = { id: d.nextId++, name: name.trim(), email: email.trim(), password, role, status: "pending" };
      d.users.push(user);
      save(d);
      return publicUser(user);
    }),

  listCases: () => run(() => seedCases.map(normalizeCase), { readOnly: true }),

  getCase: (id) =>
    run(() => {
      const c = seedCases.find((x) => x.id === id);
      if (!c) throw new ApiError("Caso clínico não encontrado.", 404);
      return normalizeCase(c);
    }, { readOnly: true }),

  saveSubmission: (user, { caseId, revealedIds, hypothesis }) =>
    run(() => {
      const raw = seedCases.find((x) => x.id === caseId);
      if (!raw) throw new ApiError("Caso clínico não encontrado.", 404);
      const c = normalizeCase(raw);
      const d = db();
      const hit = c.priorityIds.filter((id) => revealedIds.includes(id));
      const submission = {
        id: d.nextId++,
        userId: user.id,
        userName: user.name,
        caseId,
        caseTitle: c.title,
        hypothesis,
        correct: hypothesis === c.correctHypothesis,
        priorityHit: hit,
        priorityMissed: c.priorityIds.filter((id) => !hit.includes(id)),
        revealedIds,
        createdAt: new Date().toISOString(),
        teacherFeedback: null,
      };
      d.submissions.push(submission);
      save(d);
      return submission;
    }),

  listSubmissions: (userId) =>
    run(() => db().submissions.filter((s) => s.userId === userId).reverse(), { readOnly: true }),

  listAllSubmissions: () => run(() => [...db().submissions].reverse(), { readOnly: true }),

  saveFeedback: (submissionId, text) =>
    run(() => {
      const d = db();
      const s = d.submissions.find((x) => x.id === submissionId);
      if (!s) throw new ApiError("Atendimento não encontrado.", 404);
      s.teacherFeedback = text.trim();
      save(d);
      return s;
    }),

  listUsers: () => run(() => db().users.map(publicUser), { readOnly: true }),

  setUserStatus: (id, status) =>
    run(() => {
      const d = db();
      const u = d.users.find((x) => x.id === id);
      if (!u) throw new ApiError("Usuário não encontrado.", 404);
      u.status = status;
      save(d);
      return publicUser(u);
    }),
};
