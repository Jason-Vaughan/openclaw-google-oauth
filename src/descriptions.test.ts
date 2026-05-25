import { describe, it, expect } from "vitest";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import plugin from "./index.js";

const metadata = getToolPluginMetadata(plugin)!;
const toolsByName = Object.fromEntries(metadata.tools.map((t) => [t.name, t]));

// Tools whose description MUST hit one of the read-intent verbs.
// Smaller models (Qwen 14B etc.) fail to select read tools without these.
const readTools = [
  "gmail_messages_list",
  "gmail_message_get",
  "calendar_events_list",
  "calendar_event_get",
  "drive_files_list",
  "drive_file_get",
  "docs_get",
  "sheets_get",
  "sheets_values_get",
  "slides_get",
];

const writeTools = [
  "gmail_message_send",
  "gmail_message_modify",
  "gmail_message_trash",
  "calendar_event_create",
  "calendar_event_delete",
  "drive_permission_create",
  "drive_file_trash",
  "docs_create",
  "docs_append_text",
  "sheets_create",
  "sheets_values_append",
  "slides_create",
];

const readVerbs = [
  "read",
  "list",
  "check",
  "view",
  "show",
  "fetch",
  "see",
  "find",
  "look",
  "browse",
  "search",
];
const writeVerbs = [
  "create",
  "send",
  "add",
  "edit",
  "modify",
  "update",
  "share",
  "schedule",
  "make",
  "write",
  "append",
  "label",
  "archive",
  "trash",
  "delete",
  "remove",
  "cancel",
];

function descriptionHits(desc: string, verbs: string[]): string[] {
  const lower = desc.toLowerCase();
  return verbs.filter((v) => new RegExp(`\\b${v}`, "i").test(lower));
}

describe("description quality — read tools", () => {
  for (const name of readTools) {
    it(`${name}: description includes at least 2 read-intent verbs`, () => {
      const tool = toolsByName[name];
      expect(tool, `tool ${name} not found`).toBeDefined();
      const hits = descriptionHits(tool.description, readVerbs);
      expect(
        hits.length,
        `${name} description has only [${hits.join(", ")}] read verbs; want >=2 of ${readVerbs.join("/")}`
      ).toBeGreaterThanOrEqual(2);
    });
  }
});

describe("description quality — write tools", () => {
  for (const name of writeTools) {
    it(`${name}: description includes at least 1 write-intent verb`, () => {
      const tool = toolsByName[name];
      expect(tool, `tool ${name} not found`).toBeDefined();
      const hits = descriptionHits(tool.description, writeVerbs);
      expect(
        hits.length,
        `${name} description has no write verbs; want at least one of ${writeVerbs.join("/")}`
      ).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("description quality — universal", () => {
  it("every tool description is at least 40 characters", () => {
    for (const tool of metadata.tools) {
      expect(
        tool.description.length,
        `${tool.name} description too short: "${tool.description}"`
      ).toBeGreaterThanOrEqual(40);
    }
  });

  it("every tool description mentions Google or the target product", () => {
    for (const tool of metadata.tools) {
      const lower = tool.description.toLowerCase();
      const mentions =
        lower.includes("google") ||
        lower.includes("gmail") ||
        lower.includes("calendar") ||
        lower.includes("drive") ||
        lower.includes("docs") ||
        lower.includes("sheet") ||
        lower.includes("slides") ||
        lower.includes("oauth");
      expect(
        mentions,
        `${tool.name} description doesn't name a Google product or OAuth: "${tool.description}"`
      ).toBe(true);
    }
  });
});

describe("docs_append_text vs workspace edit collision", () => {
  // Smaller models confuse our docs_append_text with OpenClaw's built-in
  // workspace `edit` tool. The description must explicitly tell the model
  // to use docs_append_text for Google Doc edits.
  it("docs_append_text description explicitly claims the 'edit' verb for Google Docs", () => {
    const desc = toolsByName.docs_append_text.description.toLowerCase();
    expect(desc).toMatch(/\bedit\b/);
  });

  it("docs_create description warns against using workspace edit on Google Docs", () => {
    const desc = toolsByName.docs_create.description.toLowerCase();
    expect(desc).toContain("docs_append_text");
  });
});
