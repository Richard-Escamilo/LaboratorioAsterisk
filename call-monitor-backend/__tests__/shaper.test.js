jest.mock("../db");
jest.mock("../amiClient");
jest.mock("../provisionPjsip");

const { decideTier, TIERS } = require("../shaper");

describe("Shaper - decideTier", () => {
  test("0 llamadas activas -> tier FULL", () => {
    expect(decideTier(0).name).toBe("FULL");
  });
  test("9 llamadas activas (limite superior de FULL) -> tier FULL", () => {
    expect(decideTier(9).name).toBe("FULL");
  });
  test("10 llamadas activas -> tier MIXED", () => {
    expect(decideTier(10).name).toBe("MIXED");
  });
  test("19 llamadas activas (limite superior de MIXED) -> tier MIXED", () => {
    expect(decideTier(19).name).toBe("MIXED");
  });
  test("20 llamadas activas -> tier DOWNGRADED", () => {
    expect(decideTier(20).name).toBe("DOWNGRADED");
  });
  test("100 llamadas activas -> tier DOWNGRADED", () => {
    expect(decideTier(100).name).toBe("DOWNGRADED");
  });
  test("TIERS define exactamente 3 niveles", () => {
    expect(TIERS).toHaveLength(3);
  });
});
