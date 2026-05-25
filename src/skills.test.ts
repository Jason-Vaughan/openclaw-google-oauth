import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import plugin from "./index.js";

const skillPath = join(__dirname, "..", "skills", "google-workspace", "SKILL.md");

const skillBody = existsSync(skillPath) ? readFileSync(skillPath, "utf8") : "";

function parseFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("SKILL.md missing YAML frontmatter delimiters");
  return { frontmatter: match[1], body: match[2] };
}

describe("skills directory layout", () => {
  it("ships skills/google-workspace/SKILL.md inside the plugin", () => {
    expect(existsSync(skillPath), `expected SKILL.md at ${skillPath}`).toBe(true);
  });

  it("SKILL.md is non-trivial (>2KB)", () => {
    expect(skillBody.length).toBeGreaterThan(2048);
  });
});

describe("SKILL.md frontmatter", () => {
  const { frontmatter } = parseFrontmatter(skillBody);

  it("declares the kebab-case name 'google-workspace'", () => {
    expect(frontmatter).toMatch(/^name:\s*google-workspace\s*$/m);
  });

  it("declares a description that mentions direct OAuth and the six APIs", () => {
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    expect(descMatch, "description field missing").toBeTruthy();
    const desc = descMatch![1].toLowerCase();
    expect(desc).toMatch(/oauth/);
    for (const family of ["gmail", "calendar", "drive", "docs", "sheets", "slides"]) {
      expect(desc, `description must mention ${family}`).toContain(family);
    }
  });

  it("gates loading on the plugin being enabled", () => {
    expect(frontmatter).toContain("plugins.entries.tangleclaw-google-oauth.enabled");
  });
});

describe("SKILL.md body covers every plugin tool", () => {
  const { body } = parseFrontmatter(skillBody);
  const metadata = getToolPluginMetadata(plugin)!;

  // Tools that intentionally aren't named in the skill body's "When to use
  // which tool" tables — OAuth setup is documented separately in the OAuth
  // section, so we don't require its tools to appear in the per-API tables.
  // (Both ARE mentioned in the OAuth section.)
  const requiredInBody = metadata.tools
    .map((t) => t.name)
    .filter((n) => !n.startsWith("google_auth"));

  for (const toolName of requiredInBody) {
    it(`mentions \`${toolName}\` in the skill body`, () => {
      expect(body, `${toolName} not referenced in SKILL.md body`).toContain(toolName);
    });
  }

  it("mentions both OAuth-setup tools in the OAuth section", () => {
    expect(body).toContain("google_auth_start");
    expect(body).toContain("google_auth_complete");
  });
});

describe("SKILL.md narrate-don't-call enforcement", () => {
  const { body } = parseFrontmatter(skillBody);

  it("includes a 'never narrate' rule near the top", () => {
    // Should appear within the first 1500 characters of the body so the
    // model sees it before the per-tool details.
    expect(body.slice(0, 1500).toLowerCase()).toMatch(/never narrate|do not narrate|don't narrate/);
  });

  it("explicitly states that data changes between turns", () => {
    expect(body.toLowerCase()).toMatch(/change.*between (turn|call)/);
  });

  it("warns against using the workspace `edit` tool on Google Docs", () => {
    expect(body.toLowerCase()).toContain("workspace `edit`");
    expect(body.toLowerCase()).toContain("local");
  });

  it("warns against unsolicited drive_permission_create calls", () => {
    expect(body).toContain("drive_permission_create");
    // The warning should appear in a Sharing safety section or similar.
    expect(body.toLowerCase()).toMatch(/only call.*share|don.?t volunteer/);
  });
});

describe("plugin manifest references the skills directory", () => {
  const manifestPath = join(__dirname, "..", "openclaw.plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    skills?: string[];
  };

  it("openclaw.plugin.json has a skills field pointing at ./skills", () => {
    expect(manifest.skills, "manifest.skills missing").toBeDefined();
    expect(manifest.skills).toContain("./skills");
  });
});

describe("package.json ships the skills directory", () => {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { files?: string[] };

  it("package.json files array includes 'skills'", () => {
    expect(pkg.files, "package.json files array missing").toBeDefined();
    expect(pkg.files).toContain("skills");
  });
});
