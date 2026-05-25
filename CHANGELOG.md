# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Rewrote every tool description (and the plugin description) to use natural-language verbs like "check", "read", "send", "schedule", "share" so smaller agent models can match user intent to tool. Previous descriptions like "List messages matching a Gmail search query" were too terse — models would narrate "I'll check the inbox" without actually selecting `gmail_messages_list`. New descriptions explicitly map common user phrasings ("check email", "read message", "find files") to the right tool, document the tool→tool flow (e.g. `gmail_messages_list` → `gmail_message_get`), and include practical examples of query/parameter syntax inline. Verified by re-running the unit + live test suites; no behavior or schema changes — only descriptions.

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
