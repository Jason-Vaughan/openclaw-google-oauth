# Session Memory — openclaw-google-oauth

## Current state (as of 2026-05-27)

- **Latest version:** v0.3.5 on `main` + on ClawHub at [`@tangleclaw/openclaw-google-oauth`](https://clawhub.ai/packages/@tangleclaw/openclaw-google-oauth) (community channel, owner `@tangleclaw`).
- **Auto-publish:** `.github/workflows/publish-clawhub.yml` fires on every `v*.*.*` tag push (or manual `workflow_dispatch` with a `tag` input). Uses the `CLAWHUB_TOKEN` repo secret (token label on the ClawHub side: `updateToken`).
- **24 Google Workspace tools** across Gmail / Calendar / Drive / Docs / Sheets / Slides. `google-workspace` SKILL.md ships the agent-bias layer (Rule zero never narrate, Rule one fix-and-re-call on error, parent-id Drive traversal, sharing safety).

## Release flow (the recipe)

Just tag + push. The workflow handles the rest:

```bash
git tag -a vX.Y.Z -m "..."
git push origin vX.Y.Z
gh release create vX.Y.Z --notes "..."
# .github/workflows/publish-clawhub.yml does the rest
```

**Do NOT manually run `clawhub package publish`.** Workflow exclusively handles it; manual would race or duplicate.

## Required manifest fields (don't drop these)

`package.json` `openclaw` block must include:

```json
"openclaw": {
  "extensions": ["./dist/index.js"],
  "compat": { "pluginApi": ">=2026.5.22" },
  "build":  { "openclawVersion": "2026.5.22" }
}
```

`openclaw.plugin.json` top-level must include `"enabledByDefault": true` (forward-compat with the open OpenClaw bug below).

## Open OpenClaw bug (operator-facing workaround in README)

[openclaw/openclaw#87188](https://github.com/openclaw/openclaw/issues/87188): community plugins shipping `enabledByDefault: true` don't auto-enable on install (bundled-only short-circuit in `dist/config-normalization-shared-*.js`). Operators have to run `openclaw plugins enable tangleclaw-google-oauth` after install to activate the SKILL.md. README documents this. Confirmed empirically on RentalClaw 2026-05-27. When OpenClaw resolves, the README's second install command becomes obsolete.

## Sister plugin (cross-link target)

[`@tangleclaw/openclaw-ebay-research`](https://github.com/Jason-Vaughan/openclaw-ebay-research) — same publish posture, README "More from @tangleclaw" section in both plugins points at each other.

## Next-session candidates (none blocking)

- Monitor #87188 for OpenClaw response; if fixed, ship a docs PR removing the manual `plugins enable` step from the README and rev to v0.3.6.
- Bump `actions/checkout@v4` + `setup-node@v4` → `@v5` when those land with Node 24 support (June 2026 deprecation).
- Live integration tests on Volta are still skipped (gated on `RUN_LIVE_TESTS=1`); rerunning periodically against the real Google APIs would catch any upstream API drift.

## Convention reminder

All `@tangleclaw/*` plugin descriptions follow the README-opener style: lead with operator benefit, comma-list surfaces, lead differentiator with negative space, close with install promise. Documented in auto-memory's `reference_clawhub_publish.md`.
