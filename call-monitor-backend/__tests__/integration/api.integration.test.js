const { Agent } = require("undici");

const BASE_URL = process.env.TEST_BASE_URL || "https://localhost:4000";
const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { ...options, dispatcher });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch (e) {
    // no es JSON, se deja como texto plano
  }
  return { status: res.status, body };
}

describe("Integracion: /api/login", () => {
  test("login con credenciales validas devuelve token y rol", async () => {
    const { status, body } = await apiFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "gvn0d2jcxnAa1!" }),
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("token");
    expect(body.role).toBe("Admin");
  });

  test("login con password incorrecta devuelve 401", async () => {
    const { status, body } = await apiFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "password-incorrecta" }),
    });
    expect(status).toBe(401);
    expect(body.error).toBeDefined();
  });

  test("login sin username/password devuelve 400", async () => {
    const { status } = await apiFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
  });
});

describe("Integracion: autorizacion por rol", () => {
  let adminToken;

  beforeAll(async () => {
    const { body } = await apiFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "gvn0d2jcxnAa1!" }),
    });
    adminToken = body.token;
  });

  test("admin puede acceder al log de auditoria de login", async () => {
    const { status, body } = await apiFetch("/api/admin/login-audit", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
    expect(Array.isArray(body.audit)).toBe(true);
  });

  test("sin token, el endpoint de auditoria devuelve 401", async () => {
    const { status } = await apiFetch("/api/admin/login-audit");
    expect(status).toBe(401);
  });
});

describe("Integracion: /metrics", () => {
  test("expone metricas en formato Prometheus", async () => {
    const { status, body } = await apiFetch("/metrics");
    expect(status).toBe(200);
    expect(body).toContain("callcenter_active_calls");
  });
});

describe("Integracion: /health", () => {
  test("responde con estado ok", async () => {
    const { status } = await apiFetch("/health");
    expect(status).toBe(200);
  });
});
