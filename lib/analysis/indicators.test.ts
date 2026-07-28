import { describe, expect, it } from "vitest";
import { deltaClass, deltaSign } from "./indicators";

describe("deltaSign", () => {
  it("is + for a positive value", () => {
    expect(deltaSign(1.23)).toBe("+");
  });

  it("is - for a value that's still negative after rounding", () => {
    expect(deltaSign(-1.23)).toBe("-");
    expect(deltaSign(-0.01)).toBe("-");
  });

  it("is empty (no sign) for a tiny negative that rounds to 0.00", () => {
    expect(deltaSign(-0.0026)).toBe("");
  });

  it("is empty for exactly zero", () => {
    expect(deltaSign(0)).toBe("");
  });

  it("respects a custom decimal precision", () => {
    expect(deltaSign(-0.004, 2)).toBe("");
    expect(deltaSign(-0.004, 3)).toBe("-");
  });
});

describe("deltaClass", () => {
  it("is pos/neg for values that don't round to zero", () => {
    expect(deltaClass(5)).toBe("pos");
    expect(deltaClass(-5)).toBe("neg");
  });

  it("is empty for a value that rounds to 0.00 regardless of sign", () => {
    expect(deltaClass(-0.0026)).toBe("");
    expect(deltaClass(0.0026)).toBe("");
  });
});
