import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, isAbsolute, normalize } from "node:path";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import plugin from "./index.js";

// Spec references:
//   Skills:           https://docs.openclaw.ai/tools/skills
//   Building plugins: https://docs.openclaw.ai/plugins/building-plugins
//
// These tests complement src/skills.test.ts (which checks SKILL.md content
// shape) by enforcing structural conformance to the published OpenClaw
// parser/manifest specifications. v0.3.0 shipped a SKILL.md whose `metadata`
// frontmatter put the JSON value on a line *below* the key — valid YAML but
// a violation of the OpenClaw embedded parser's documented single-line-only
// constraint. That bug passed every src/skills.test.ts assertion. These
// tests close that gap.

const repoRoot = join(__dirname, "..");
const skillsRoot = join(repoRoot, "skills");
const manifestPath = join(repoRoot, "openclaw.plugin.json");

// -----------------------------------------------------------------------------
// SKILL.md spec compliance (per https://docs.openclaw.ai/tools/skills)
// -----------------------------------------------------------------------------

function extractFrontmatterLines(raw: string): string[] {
  const lines = raw.split("\n");
  if (lines.length === 0 || lines[0].trim() !== "---") {
    throw new Error("SKILL.md must start with '---' frontmatter delimiter");
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return lines.slice(1, i);
    }
  }
  throw new Error("SKILL.md frontmatter missing closing '---' delimiter");
}

// Every "top-level" key in the frontmatter — i.e. a line that starts at
// column 0 with `<word>:`. Per the docs:
//   "The parser used by the embedded agent supports single-line frontmatter
//    keys only."
// So every line that isn't a top-level key declaration must be empty.
function findMultiLineKeys(frontmatterLines: string[]): string[] {
  const violations: string[] = [];
  let currentKey: string | null = null;
  for (const line of frontmatterLines) {
    if (line.trim() === "") continue;
    const topLevelMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):/);
    if (topLevelMatch) {
      // It's a key declaration. The same line should contain the value
      // (after the colon). If the rest of the line is empty/whitespace,
      // the value is on the NEXT line — multi-line, which violates spec.
      const afterColon = line.slice(topLevelMatch[0].length).trim();
      if (afterColon === "") {
        violations.push(topLevelMatch[1]);
      }
      currentKey = topLevelMatch[1];
    } else {
      // Indented continuation of the previous key — also multi-line.
      if (currentKey && !violations.includes(currentKey)) {
        violations.push(currentKey);
      }
    }
  }
  return violations;
}

function parseFrontmatterSingleLine(
  frontmatterLines: string[]
): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of frontmatterLines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    parsed[m[1]] = m[2].trim();
  }
  return parsed;
}

function stripYamlQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

describe("SKILL.md frontmatter spec compliance (per docs.openclaw.ai/tools/skills)", () => {
  const skillMdPath = join(skillsRoot, "google-workspace", "SKILL.md");
  const raw = readFileSync(skillMdPath, "utf8");
  const frontmatterLines = extractFrontmatterLines(raw);
  const frontmatter = parseFrontmatterSingleLine(frontmatterLines);

  it("has well-formed '---' delimiters and a non-empty frontmatter region", () => {
    expect(frontmatterLines.length).toBeGreaterThan(0);
  });

  it("has NO multi-line frontmatter keys (parser supports single-line only)", () => {
    const violations = findMultiLineKeys(frontmatterLines);
    expect(
      violations,
      `Multi-line frontmatter key(s) detected: ${violations.join(", ")}. ` +
        `Per https://docs.openclaw.ai/tools/skills the embedded parser ` +
        `supports single-line frontmatter keys only. Put the value on the ` +
        `SAME line as the key (e.g. 'metadata: { ... }' on one line).`
    ).toEqual([]);
  });

  it("'metadata', if present, has its JSON value on the same line as the key", () => {
    if (!("metadata" in frontmatter)) return; // metadata is optional
    const value = frontmatter.metadata;
    expect(
      value.length,
      "metadata key declared with empty value on same line — JSON appears to be on a continuation line, which violates the single-line-only rule"
    ).toBeGreaterThan(0);
    expect(
      value.startsWith("{"),
      `metadata value must start with '{' on the same line as the key. Got: ${JSON.stringify(value.slice(0, 60))}`
    ).toBe(true);
  });

  it("'metadata', if present, parses as valid JSON", () => {
    if (!("metadata" in frontmatter)) return;
    expect(() => JSON.parse(frontmatter.metadata)).not.toThrow();
  });

  it("'metadata.openclaw.requires.config', if present, references real config paths", () => {
    if (!("metadata" in frontmatter)) return;
    const metadata = JSON.parse(frontmatter.metadata) as {
      openclaw?: { requires?: { config?: string[] } };
    };
    const configPaths = metadata.openclaw?.requires?.config;
    if (!configPaths) return;
    for (const path of configPaths) {
      expect(
        path.startsWith("plugins.entries."),
        `requires.config path '${path}' should reference plugins.entries.<id>.* — other shapes are unverified`
      ).toBe(true);
    }
  });

  it("'name' is a non-empty string", () => {
    expect(frontmatter.name).toBeDefined();
    const name = stripYamlQuotes(frontmatter.name);
    expect(name.length).toBeGreaterThan(0);
  });

  it("'description' is a non-empty string", () => {
    expect(frontmatter.description).toBeDefined();
    const desc = stripYamlQuotes(frontmatter.description);
    expect(desc.length).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------------
// Plugin manifest spec compliance
// (per https://docs.openclaw.ai/plugins/building-plugins)
// -----------------------------------------------------------------------------

describe("openclaw.plugin.json spec compliance", () => {
  const manifestRaw = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;

  it("has all required top-level fields (id, name, description)", () => {
    expect(manifest.id, "manifest.id required").toBeTypeOf("string");
    expect(manifest.name, "manifest.name required").toBeTypeOf("string");
    expect(manifest.description, "manifest.description required").toBeTypeOf(
      "string"
    );
    expect((manifest.id as string).length).toBeGreaterThan(0);
    expect((manifest.name as string).length).toBeGreaterThan(0);
    expect((manifest.description as string).length).toBeGreaterThan(0);
  });

  it("contracts.tools is a non-empty string array", () => {
    const contracts = manifest.contracts as { tools?: unknown } | undefined;
    expect(contracts, "manifest.contracts required").toBeDefined();
    expect(
      Array.isArray(contracts!.tools),
      "manifest.contracts.tools must be an array"
    ).toBe(true);
    const tools = contracts!.tools as unknown[];
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(typeof t, "every tool name must be a string").toBe("string");
    }
  });

  it("every contracts.tools entry has a matching registered tool definition", () => {
    const tools = ((manifest.contracts as { tools: string[] }).tools) ?? [];
    const pluginMetadata = getToolPluginMetadata(plugin)!;
    const registeredNames = new Set(pluginMetadata.tools.map((t) => t.name));
    for (const declared of tools) {
      expect(
        registeredNames.has(declared),
        `manifest declares '${declared}' in contracts.tools but no matching defineToolPlugin registration`
      ).toBe(true);
    }
  });

  it("every path in manifest.skills points to an existing directory inside the repo", () => {
    const skills = manifest.skills as string[] | undefined;
    if (!skills) return; // skills field optional for non-skill plugins
    expect(Array.isArray(skills), "manifest.skills must be an array").toBe(
      true
    );
    for (const rel of skills) {
      expect(
        isAbsolute(rel),
        `manifest.skills entries must be relative paths inside the plugin, got: ${rel}`
      ).toBe(false);
      const resolved = normalize(join(repoRoot, rel));
      expect(
        resolved.startsWith(repoRoot),
        `manifest.skills entry '${rel}' resolves outside the plugin root`
      ).toBe(true);
      expect(
        existsSync(resolved),
        `manifest.skills entry '${rel}' does not exist at ${resolved}`
      ).toBe(true);
      expect(
        statSync(resolved).isDirectory(),
        `manifest.skills entry '${rel}' is not a directory`
      ).toBe(true);
    }
  });

  it("activation.onStartup, if present, is a boolean", () => {
    const activation = manifest.activation as
      | { onStartup?: unknown }
      | undefined;
    if (!activation || !("onStartup" in activation)) return;
    expect(typeof activation.onStartup).toBe("boolean");
  });
});

// -----------------------------------------------------------------------------
// Skill directory layout
// -----------------------------------------------------------------------------

describe("skill directory layout", () => {
  it("every SKILL.md under skills/ sits at skills/<name>/SKILL.md or skills/<group>/<name>/SKILL.md", () => {
    // Per docs: "SKILL.md exists at the skill root or one grouping level
    // deep: skills/<group>/<skill>/SKILL.md"
    // For our plugin we expect skills/google-workspace/SKILL.md (the
    // one-level form). This test future-proofs against accidental deeper
    // nesting that the parser wouldn't discover.
    const fs = require("node:fs") as typeof import("node:fs");
    function walk(dir: string, depth: number): string[] {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          out.push(...walk(join(dir, entry.name), depth + 1));
        } else if (entry.name === "SKILL.md") {
          // depth counts from skillsRoot; valid depths are 1 (skills/<name>/SKILL.md)
          // and 2 (skills/<group>/<name>/SKILL.md).
          out.push(`${depth}:${join(dir, entry.name)}`);
        }
      }
      return out;
    }
    const found = walk(skillsRoot, 0);
    expect(found.length, "expected at least one SKILL.md under skills/").toBeGreaterThan(
      0
    );
    for (const entry of found) {
      const [depthStr, path] = entry.split(":", 2);
      const depth = Number.parseInt(depthStr, 10);
      expect(
        depth === 1 || depth === 2,
        `SKILL.md at unsupported nesting depth (${depth}): ${path}. ` +
          `Per spec, allowed shapes are skills/<name>/SKILL.md or skills/<group>/<name>/SKILL.md.`
      ).toBe(true);
    }
  });
});
