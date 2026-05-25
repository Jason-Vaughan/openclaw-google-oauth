# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
