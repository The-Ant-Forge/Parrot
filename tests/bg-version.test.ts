import { describe, it, expect } from "vitest";
import { isNewerVersion } from "../src/entrypoints/bg/version";

describe("isNewerVersion", () => {
  it("returns true when latest major is higher", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true);
  });

  it("returns true when latest minor is higher", () => {
    expect(isNewerVersion("1.2.0", "1.1.0")).toBe(true);
  });

  it("returns true when latest patch is higher", () => {
    expect(isNewerVersion("1.1.2", "1.1.1")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false);
  });

  it("handles different segment counts", () => {
    expect(isNewerVersion("1.2", "1.1.9")).toBe(true);
    expect(isNewerVersion("1.0", "1.0.1")).toBe(false);
  });

  it("handles real Parrot version format (Major.A.B)", () => {
    expect(isNewerVersion("1.16.2", "1.16.1")).toBe(true);
    expect(isNewerVersion("1.17.0", "1.16.15")).toBe(true);
    expect(isNewerVersion("1.16.1", "1.16.1")).toBe(false);
  });
});
