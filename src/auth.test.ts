import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { expandHome, SCOPES } from "./auth.js";

describe("expandHome", () => {
  it("returns homedir for '~'", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  it("expands '~/' prefix", () => {
    expect(expandHome("~/foo/bar")).toBe(`${homedir()}/foo/bar`);
  });

  it("does not expand mid-path tildes", () => {
    expect(expandHome("/etc/~/foo")).toBe("/etc/~/foo");
  });

  it("passes absolute paths through unchanged", () => {
    expect(expandHome("/var/log/app.log")).toBe("/var/log/app.log");
  });

  it("passes relative paths through unchanged", () => {
    expect(expandHome("./relative/path")).toBe("./relative/path");
  });
});

describe("SCOPES", () => {
  it("includes scopes for all six Workspace APIs", () => {
    const families = [
      "gmail",
      "calendar",
      "drive",
      "documents",
      "spreadsheets",
      "presentations",
    ];
    for (const family of families) {
      expect(
        SCOPES.some((s) => s.includes(family)),
        `no scope for ${family}`
      ).toBe(true);
    }
  });

  it("uses Google's HTTPS scope URLs", () => {
    for (const scope of SCOPES) {
      expect(scope).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//);
    }
  });

  it("requests gmail.modify (read+label) instead of gmail.readonly", () => {
    expect(SCOPES).toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(SCOPES).not.toContain("https://www.googleapis.com/auth/gmail.readonly");
  });

  it("uses drive.file (per-app) not full drive scope", () => {
    expect(SCOPES).toContain("https://www.googleapis.com/auth/drive.file");
    expect(SCOPES).not.toContain("https://www.googleapis.com/auth/drive");
  });
});
