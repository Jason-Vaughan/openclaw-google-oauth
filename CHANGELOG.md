# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.3] — 2026-05-27

### Internal

- **Human-readable description on ClawHub.** Rewrote the `description` field in both `package.json` and `openclaw.plugin.json` from a parenthetical feature-enum (`Gmail (send/read/label/trash), Calendar (events + delete), ...`) to the README's opener phrasing — leads with the operator's benefit ("24 Google Workspace tools for your OpenClaw agent"), keeps the "No MCP / No gateway / No App Password" differentiator, and drops the comma-soup that made the ClawHub listing card hard to scan. No behavior change.

## [0.3.2] — 2026-05-27

### Internal

- **Add `openclaw.compat.pluginApi` + `openclaw.build.openclawVersion` to `package.json`** so ClawHub's `package publish` accepts the plugin as an external code-plugin artifact. Values match the installed openclaw runtime (`>=2026.5.22` / `2026.5.22`). No user-visible behavior change — this is purely the ClawHub publish gate.
- **Reconcile manifest version drift.** `openclaw.plugin.json` was lagging at `0.3.0` while `package.json` had been bumped to `0.3.1` in PR #9. Regenerated with `openclaw plugins build` so both files report `0.3.2` for this release.

## [0.3.1] — 2026-05-25

Hot-fix release addressing a SKILL.md frontmatter parsing bug that prevented v0.3.0's `google-workspace` skill from biasing agent behavior reliably, plus tightening the skill content against the specific narrate-on-error failure mode observed on Volta 2026-05-24.

### Fixed

- **SKILL.md `metadata` frontmatter is now single-line.** Previous format (`metadata:` on one line, JSON value indented on the next) violated the OpenClaw embedded parser's documented single-line-only constraint ([Skills spec](https://docs.openclaw.ai/tools/skills): *"The parser used by the embedded agent supports single-line frontmatter keys only"* and *"metadata: Single-line JSON object only"*). Result on v0.3.0: the skill loaded structurally but its `metadata.openclaw.requires.config` gate behaved unpredictably, contributing to the skill not biasing the agent reliably on Volta.
- **Drive folder-name-vs-id failure mode is now an explicit anti-pattern callout in the Drive subsection.** Volta hit this in production: agent received "list images in `eBay_Photos`", constructed `'eBay_Photos' in parents` (treating the folder name as if it were a folder ID), got `File not found: .`, then narrated a recovery plan instead of executing the two-step lookup. The skill's "Drive query syntax" section already documented the correct two-step pattern (find folder by name → use its `id` in `'<id>' in parents`), but as a single sentence buried below the tool table. Now hoisted to a bolded callout immediately under the Drive tool table, with the failure-mode error string named verbatim.
- **New "Rule one: on tool error, fix and re-call — do not narrate" section** placed immediately after "Rule zero". Codifies the recovery discipline: after a tool error, the next thing in the same turn must be a corrected tool call or a real question to the user — never a narrated recovery plan. Specifically calls out "Let me list folders to find the right one" without then actually listing them as the #1 failure mode. Directly addresses the post-error narration observed on Volta.

### Internal

- **`src/skill-spec.test.ts`** — new test file enforcing OpenClaw skill/manifest spec compliance, complementing the existing content-shape tests in `src/skills.test.ts`. Catches the exact class of bug v0.3.0 shipped: (1) frontmatter has no multi-line keys; (2) `metadata` field, if present, has its JSON value on the same line as the key; (3) `metadata` JSON parses successfully; (4) `name` + `description` are non-empty strings; (5) plugin manifest has required top-level fields per [building-plugins spec](https://docs.openclaw.ai/plugins/building-plugins); (6) every path in the manifest's `skills` array points to an existing directory; (7) every name in `contracts.tools` has a matching registered tool definition.
- `docs/skill-verification-prompt.md` — focused agent prompt for verifying the `google-workspace` SKILL.md actually biases agent behavior (vs. the smoke-test prompt, which tests tool surfaces). Six tests: never-narrate enforcement, re-call-on-followup, parent-id Drive traversal, edit-tool selection, sharing safety, cleanup. Includes an interpretation table mapping each failure pattern to its root cause. Linked from README under the Skills section. (Authored in PR #8 post-v0.3.0; reclassified from `### Added` to `### Internal` here since it's operator testing infrastructure, not user-visible plugin behavior.)

## [0.3.0] — 2026-05-25

### Added

- **`skills/google-workspace/SKILL.md`** — first shipped OpenClaw skill. Loads into the agent's system prompt (gated on `plugins.entries.tangleclaw-google-oauth.enabled`) as an instructional layer documenting when to use which of the 24 tools, including: a "rule zero" against narrating without calling, an explicit "data changes between turns, always re-call" mandate, the Drive query syntax for folder traversal (`'<folder-id>' in parents`), multi-step workflow recipes (send-an-update-from-sheet, browse-photos-in-shared-subfolder, schedule-and-email, cleanup), an explicit warning that `docs_append_text` is the Google-Docs edit tool (NOT the workspace `edit` tool), and a sharing-safety rule that prohibits unsolicited `drive_permission_create` calls. This is the durable fix for the recurring narrate-don't-call failure mode that earlier description-tuning iterations only partially addressed.
- 34 new unit tests in `src/skills.test.ts` enforcing skill structure: frontmatter shape, every plugin tool is referenced in the body, the narrate-don't-call rule is in the first 1500 characters, the workspace-edit warning is present, the sharing-safety warning is present, the manifest references the skills directory, and `package.json` ships the `skills/` folder.

### Changed

- `openclaw.plugin.json` now declares `"skills": ["./skills"]` so OpenClaw discovers the skill on plugin load.
- `package.json` `files` array now includes `skills` so npm packages ship the skill content.

## [0.2.1] — 2026-05-25

### Changed

- Read tool descriptions now explicitly push the agent to **re-call on follow-up questions** instead of reusing previous results. Failure mode this fixes: agent calls `drive_files_list` once, user adds a new folder, user asks "do you see it now?", agent narrates "Let me check..." but never re-calls the tool because it thinks it already has the data. Updated descriptions on `drive_files_list`, `gmail_messages_list`, `calendar_events_list`, `sheets_values_get`, and `docs_get` to lead with "ALWAYS call this tool — do not narrate, do not reuse previous results" and to enumerate the "is it there now / did something arrive / what changed" follow-up phrasings. `drive_files_list` additionally emphasizes the `'<folder-id>' in parents` query as the primary syntax for "what's inside this folder" requests (the agent was failing to construct that on its own).

## [0.2.0] — 2026-05-25

### Changed

- **Drive scope widened from `drive.file` to full `drive`.** The previous `drive.file` scope only let the plugin see files it had created itself — folders/files shared *with* the authorized account were invisible, even when the share permission was granted. That broke the natural mental model where Drive ACLs (read-only/writer share) decide what the agent can do. With full `drive`, the agent now sees the entire visible Drive of the authorized account, and per-file Google ACLs decide what's read-only vs writable vs owned. **Re-auth required** — changing scopes invalidates the existing refresh token; run `google_auth_start` + `google_auth_complete` once after upgrading. `drive_files_list` description now documents folder-search and contents-of-folder query syntax (`'<folder-id>' in parents`, `sharedWithMe = true`, `mimeType='application/vnd.google-apps.folder'`). New regression test in `src/live.test.ts` confirms the `sharedWithMe = true` query is callable under the widened scope (it returned an empty array under `drive.file` regardless of actual shares — that was the failure mode users hit when sharing folders like `eBay_Photos` with the agent).
- Rewrote every tool description (and the plugin description) for agent discoverability. Read tools now lead with `READ` + explicit verb lists (read/list/check/view/show/fetch/see/find/look/browse) so smaller agent models like Qwen 2.5 14B reliably select them instead of narrating "I'll check the inbox" without acting. Write tools document the user-facing intent (edit/send/schedule/share). `docs_append_text` is explicitly labeled as THE edit tool for Google Docs (to prevent collision with OpenClaw's built-in workspace `edit` tool, which is for local files only). Tool→tool flows (e.g. `gmail_messages_list` → `gmail_message_get`) and parameter examples are inlined. No schema or behavior changes — descriptions only.

### Added

- `src/descriptions.test.ts` — 23 unit tests that enforce description quality: read tools must include ≥2 read-intent verbs, write tools must include ≥1 write-intent verb, every tool must name a Google product or OAuth, and `docs_append_text` must claim the "edit" verb. Prevents description regressions.
- Expanded `src/live.test.ts` to cover **all** 21 tools with real round-trips (when `RUN_LIVE_TESTS=1`): Gmail send→list→get→modify, Calendar create→list→get, Drive list/get, Docs create→get→append→verify, Sheets create→get→append→read, Slides create→get. All fixtures are auto-cleaned up via `afterAll` (messages trashed, events/files deleted). `drive_permission_create` test is additionally gated behind `LIVE_SHARE_TEST_EMAIL` so it doesn't share real files with arbitrary addresses.
- `vitest.config.ts` — restricts test discovery to `src/**/*.test.ts` so stale compiled tests in `dist/` don't run.
- `docs/smoke-test-prompt.md` — a single agent prompt that exercises every tool end-to-end (write, read, edit across all six APIs) plus a cleanup prompt and a table for interpreting failure modes (model picking wrong tool vs. narration vs. API error). Linked from README's "Verify it works" section. Useful after first install, after scope changes, or when bumping the agent's model.
- **3 new delete/trash tools** (24 tools total, up from 21): `gmail_message_trash` (moves a message to Gmail Trash, recoverable 30 days), `calendar_event_delete` (deletes a calendar event, recoverable from Calendar Trash ~30 days), `drive_file_trash` (moves a Drive file / Doc / Sheet / Slides to Drive Trash, recoverable 30 days). Closes the cleanup gap in `docs/smoke-test-prompt.md` — the cleanup prompt no longer asks users to fall back to the Google UI. All three covered by both unit (description-quality) and live integration tests.
- **Step-by-step "Publish the OAuth app to escape the 7-day refresh-token expiry" guide** added to README. Includes explicit reassurance that publishing does NOT grant other people access to your data (the security boundary is your `gmail-token.json`, not the consent screen status). Required reading before unattended-operation deployments — without publishing, the refresh token dies every Sunday and the agent silently stops working.
- **"No MCP server" positioning** added to README and package/GitHub descriptions. Many users coming from Claude Desktop / Cursor assume "Google tools for an AI agent" means running an MCP server alongside the agent — this plugin doesn't. It loads in-process inside the OpenClaw gateway with no separate daemon, no MCP stdio binary, no extra port. The README's "Why direct OAuth?" section now contrasts this plugin against MCP, IMAP App Password, and SaaS-gateway alternatives.

## [0.1.0] — 2026-05-24

### Added

- Initial release.
- OAuth tools: `google_auth_start`, `google_auth_complete`.
- Gmail tools: `gmail_messages_list`, `gmail_message_get`, `gmail_message_send`, `gmail_message_modify`.
- Calendar tools: `calendar_events_list`, `calendar_event_create`, `calendar_event_get`.
- Drive tools: `drive_files_list`, `drive_file_get`, `drive_permission_create`.
- Docs tools: `docs_create`, `docs_get`, `docs_append_text`.
- Sheets tools: `sheets_create`, `sheets_get`, `sheets_values_get`, `sheets_values_append`.
- Slides tools: `slides_create`, `slides_get`.
- One OAuth client, six APIs, one consent flow.
- `configSchema` with `credentialsPath` and `tokenPath` (tilde expansion supported).
- Standalone `scripts/oauth-setup.mjs` for interactive first-time authorization.
- 22 unit tests plus 7 env-gated live-integration tests.
- README walkthrough covering Google Cloud Console setup, the OAuth dance, and the 7-day refresh-token expiry trap.
