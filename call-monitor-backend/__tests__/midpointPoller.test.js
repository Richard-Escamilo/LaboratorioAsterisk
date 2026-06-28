jest.mock("../db");
jest.mock("../amiClient");
jest.mock("../provisionPjsip");

const { generatePassword, userHasRole, extractUsername } = require("../midpointPoller");

describe("midpointPoller - generatePassword", () => {
  test("genera una contrasena con longitud minima razonable", () => {
    const pwd = generatePassword();
    expect(pwd.length).toBeGreaterThanOrEqual(10);
  });
  test("siempre termina con el patron Aa1! (mayuscula+numero+simbolo)", () => {
    const pwd = generatePassword();
    expect(pwd).toMatch(/Aa1!$/);
  });
  test("genera contrasenas distintas en cada llamada", () => {
    const pwd1 = generatePassword();
    const pwd2 = generatePassword();
    expect(pwd1).not.toBe(pwd2);
  });
});

describe("midpointPoller - userHasRole", () => {
  test("retorna true si el usuario tiene el assignment con el oid correcto", () => {
    const user = { assignment: [{ targetRef: { oid: "role-123" } }] };
    expect(userHasRole(user, "role-123")).toBe(true);
  });
  test("retorna false si el usuario no tiene ningun assignment con ese oid", () => {
    const user = { assignment: [{ targetRef: { oid: "role-999" } }] };
    expect(userHasRole(user, "role-123")).toBe(false);
  });
  test("retorna false si el usuario no tiene assignment en absoluto", () => {
    const user = {};
    expect(userHasRole(user, "role-123")).toBe(false);
  });
  test("maneja un solo assignment como objeto (no array)", () => {
    const user = { assignment: { targetRef: { oid: "role-123" } } };
    expect(userHasRole(user, "role-123")).toBe(true);
  });
});

describe("midpointPoller - extractUsername", () => {
  test("extrae el username cuando 'name' es un string simple", () => {
    const user = { name: "agente1" };
    expect(extractUsername(user)).toBe("agente1");
  });
  test("extrae el username cuando 'name' es un objeto con #text", () => {
    const user = { name: { "#text": "agente2" } };
    expect(extractUsername(user)).toBe("agente2");
  });
  test("retorna null si no hay name en absoluto", () => {
    const user = {};
    expect(extractUsername(user)).toBeNull();
  });
});
