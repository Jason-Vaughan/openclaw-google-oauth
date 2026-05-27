# @tangleclaw/openclaw-google-oauth

<img src="https://github.com/Jason-Vaughan/project-assets/raw/main/openclaw-google-oauth-no-mcp.png" align="right" width="160" alt="No MCP server required">

**Google Workspace tools for [OpenClaw](https://openclaw.ai) — Gmail, Calendar, Drive, Docs, Sheets, Slides — via direct OAuth.** Your OAuth client talks straight to `googleapis.com`. **No MCP server to run.** No third-party gateway. No IMAP/App Password workaround. Install the plugin, complete the OAuth dance once, and 24 Google Workspace tools are callable from your OpenClaw agent.

## Looking for...

- An OpenClaw plugin to **send Gmail** from your agent? → yes, this.
- An OpenClaw plugin to **read your inbox / search messages / label threads**? → yes.
- An OpenClaw plugin for **Google Calendar** (list events, create events)? → yes.
- An OpenClaw plugin for **Google Docs** (create, read, append text)? → yes.
- An OpenClaw plugin for **Google Sheets** (create, read values, append rows)? → yes.
- An OpenClaw plugin for **Google Slides** (create, read presentations)? → yes.
- An OpenClaw plugin for **Google Drive** (list, share files)? → yes.
- A **Google Workspace** / **Google API** plugin for OpenClaw that doesn't route through someone else's SaaS? → yes, this is it.

One install, one OAuth consent, six Google APIs callable as agent tools.

## ⚠️ Use a dedicated Google account — do NOT use your personal email

This plugin requests **full `drive` scope**, which means anything in the authorized account's Google Drive is readable (and, for files the agent owns or was shared as writer, writable) by the agent. Do **not** point this at your personal Gmail / Drive. Create a dedicated Google account for the agent (e.g. `myproject-agent@gmail.com`) and authorize *that* account. Then:

- Share specific folders / files from your personal account to the agent account with the permission you want (reader / commenter / writer). The agent will see exactly what you shared, with the permission you granted — nothing more.
- The agent's own Drive starts empty. Anything it creates (Docs, Sheets, Slides) is owned by the agent account.
- If you ever want to revoke access entirely, revoke the OAuth grant at <https://myaccount.google.com/permissions> and / or unshare the folders.

This pattern keeps the blast radius small: the agent can read what you share with it, write what it created itself, and nothing else. Pointing it at a personal account would give the agent (and anything controlling the plugin) the keys to your entire mail history, calendar, Drive, etc.

### If you really can't use a dedicated account: narrow the scopes

If you must point this at an existing personal-ish account, fork the plugin and edit the `SCOPES` array in [`src/auth.ts`](src/auth.ts). Drop scopes you don't need, or swap broad ones for narrower variants. Some safer swaps:

| Default scope | Narrower option | Trade-off |
|---|---|---|
| `auth/drive` | `auth/drive.readonly` | Agent can READ everything in Drive (including shared folders) but cannot edit, move, delete, or upload. Drive write-back tools will fail. |
| `auth/drive` | `auth/drive.file` | Agent only sees files it created itself + files picked via Google Picker. Cannot see arbitrary shared folders (the original problem we widened scope to fix — only use if you don't need shared-folder access). |
| `auth/gmail.modify` | `auth/gmail.readonly` | Agent can read inbox but cannot star, label, archive, or trash. Send is unaffected (uses `gmail.send`). |
| `auth/gmail.send` | _(remove)_ | Agent cannot send mail at all. |
| `auth/calendar.events` | _(remove)_ | Agent cannot read or write calendar. |
| _(all docs/sheets/slides scopes)_ | _(remove individually)_ | Agent cannot create/read/edit that file type. The corresponding tools will fail with `insufficient permission`. |

After editing `SCOPES`, rebuild (`npm run build`), re-deploy to your OpenClaw install, and **re-run the OAuth dance** to pick up the new scope set. Re-auth is mandatory after any scope change — the existing token bakes in the old scope list and Google will refuse new requests against scopes you've now removed.

> Reminder: the dedicated-account approach is still strongly preferred. Narrowing scopes reduces what's exposed *if* the agent or token leaks, but it doesn't change the underlying principle that the agent has direct access to a real Google account.

## What you get

A single OpenClaw plugin that exposes 24 agent-callable tools spanning six Google APIs from one OAuth client:

| Family | Tools |
|---|---|
| OAuth | `google_auth_start`, `google_auth_complete` |
| Gmail | `gmail_messages_list`, `gmail_message_get`, `gmail_message_send`, `gmail_message_modify`, `gmail_message_trash` |
| Calendar | `calendar_events_list`, `calendar_event_create`, `calendar_event_get`, `calendar_event_delete` |
| Drive | `drive_files_list`, `drive_file_get`, `drive_permission_create`, `drive_file_trash` |
| Docs | `docs_create`, `docs_get`, `docs_append_text` |
| Sheets | `sheets_create`, `sheets_get`, `sheets_values_get`, `sheets_values_append` |
| Slides | `slides_create`, `slides_get` |

## Why direct OAuth?

Other Google integrations for AI agents typically come as one of:

- An **MCP server** you have to install, run as a separate process, and keep alive (often single-API, one per server, with its own OAuth plumbing).
- An **App Password over IMAP/SMTP** wrapper (Gmail-only, no Workspace coverage, no OAuth).
- A **third-party SaaS gateway** that mediates between you and Google (your mail/docs traffic passes through them, you authorize *their* OAuth app).

This plugin is **none of those.** It loads in-process inside the OpenClaw gateway — no MCP server, no extra daemon — uses **your own OAuth client** talking **directly** to `googleapis.com`, and covers all six Workspace APIs from one consent flow. Trust boundary is just you and Google.

## Install

```bash
openclaw plugins install clawhub:@tangleclaw/openclaw-google-oauth
openclaw plugins enable tangleclaw-google-oauth
```

> **Why two commands?** Community-installed OpenClaw plugins currently don't auto-enable on install — only bundled plugins do, due to a gating quirk in the OpenClaw runtime (filed upstream as [openclaw/openclaw#87188](https://github.com/openclaw/openclaw/issues/87188), with empirical confirmation). The plugin's tools load fine after just `install`, but the `google-workspace` SKILL.md (the agent-bias layer that biases against narrating-without-calling, encodes recipes, etc.) shows as **blocked** with `Missing requirements: config:plugins.entries.tangleclaw-google-oauth.enabled`. The `plugins enable` command flips that flag and activates the skill. This plugin already ships `enabledByDefault: true` in its manifest, so the second command will become unnecessary once #87188 ships.

Or for local dev (e.g. cloned this repo):

```bash
cd openclaw-google-oauth
npm install
npm run plugin:build
openclaw plugins install /path/to/openclaw-google-oauth
openclaw plugins enable tangleclaw-google-oauth
```

## Setup (one time)

### 1. Create an OAuth client in Google Cloud Console

1. <https://console.cloud.google.com/> → create a new project (any name).
2. APIs & Services → Library → enable all six APIs you'll use: **Gmail API**, **Google Calendar API**, **Google Drive API**, **Google Docs API**, **Google Sheets API**, **Google Slides API**.
3. APIs & Services → OAuth consent screen → **User Type: External** (NOT Internal — Internal only works for Google Workspace org members and will reject personal Gmail accounts with `Error 403: org_internal`). App name of your choice, **TESTING** status, add your Google account as a test user.
4. APIs & Services → Credentials → Create Credentials → OAuth client ID → **Desktop app** → download the JSON.

### 2. Place credentials

Default path is `~/.openclaw/secrets/gmail-credentials.json`:

```bash
mkdir -p ~/.openclaw/secrets
mv ~/Downloads/client_secret_*.json ~/.openclaw/secrets/gmail-credentials.json
chmod 600 ~/.openclaw/secrets/gmail-credentials.json
```

To use a different path, set `credentialsPath` in the plugin config.

### 3. Run the OAuth dance from the agent

This is a 6-step interactive flow that happens once (or whenever you re-scope / re-publish). It involves opening a browser, signing in to Google, copying a value out of the URL bar, and pasting it back. Step by step:

**Step 1.** Have your agent call `google_auth_start` (no parameters). The tool returns:

```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "instructions": "Open authUrl in a browser..."
}
```

Copy the `authUrl` value.

**Step 2.** Open that URL in any browser. (Can be on a different machine — phone, laptop, etc.)

**Step 3.** Sign in with the dedicated Google account you set up for this plugin (NOT your personal email — see the ⚠️ warning above).

**Step 4.** Google shows the consent screen with a list of permissions ("See, edit, create, and delete all your Google Drive files", "Send email on your behalf", "View and edit events on all your calendars", etc.). On a Testing-status app you may also see a "Google hasn't verified this app" warning — click **Advanced** → **Go to `<your app name>` (unsafe)** to proceed. Then on the consent screen:

  1. Click **"Select all"** at the top of the permission checklist.
  2. Click the blue **"Continue"** button at the bottom.

**Step 5.** The browser will then try to load `http://localhost/?code=...` (or `http://localhost:4001/...` depending on your OAuth client's configured redirect URI). The page will fail to load with **"This site can't be reached"** or **"ERR_CONNECTION_REFUSED"** — **this is expected and correct.** There is no server running on localhost; we only need the URL bar.

  Look at the URL in your browser's address bar. It'll look like:

  ```
  http://localhost/?iss=https://accounts.google.com&code=4/0AeoWuM-xxxxxxxxxxxxxxxxxxxxxxxxxxxx&scope=https://www.googleapis.com/auth/...
  ```

  The piece you need is the `code=` value — everything between `code=` and the next `&`. Copy just that string (a long string starting with `4/0`).

**Step 6.** Call `google_auth_complete` with `code: "<the value you copied>"`. The tool writes a refresh-token-bearing token file to `~/.openclaw/secrets/gmail-token.json` (or wherever you set `tokenPath`) and returns:

```json
{
  "ok": true,
  "tokenPath": "/home/.../.openclaw/secrets/gmail-token.json",
  "scopes": ["https://www.googleapis.com/auth/gmail.modify", ...]
}
```

That's it — the token is in place and every other tool in this plugin (`gmail_messages_list`, `calendar_event_create`, etc.) will use it automatically.

**If you don't have agent access yet (first-time install):** use the standalone setup script instead: `node scripts/oauth-setup.mjs` in the plugin directory. It does the same 6 steps interactively in a terminal.

**When to re-run this dance:**
- After installing the plugin for the first time.
- After widening or narrowing the requested OAuth scopes (changing `SCOPES` in `src/auth.ts`).
- After Publishing the OAuth app (the Testing-status token has a 7-day clock; the Production-status token issued from a re-auth lives indefinitely — see "The 7-day refresh-token expiry trap" below).
- If you ever see `invalid_grant` errors from any tool — usually means the token expired (Testing) or was revoked.

That's it. All other tools work from there.

## Configuration

The plugin reads two values from its OpenClaw config block:

| Key | Default | Description |
|---|---|---|
| `credentialsPath` | `~/.openclaw/secrets/gmail-credentials.json` | Path to the OAuth client JSON from Google Cloud Console. |
| `tokenPath` | `~/.openclaw/secrets/gmail-token.json` | Path where the refresh-token-bearing token file is written + read. |

Tilde expansion (`~/`) is supported.

## Scopes requested

```
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/presentations
```

**Full `drive` scope** is requested intentionally so the agent can see and act on folders/files shared *with* the authorized account, not just files it created itself. The natural permission model still applies: per-file Drive ACLs decide what the agent can actually do (shared-as-reader = read-only, shared-as-writer = read+write, files the agent owns = full control). If you want to restrict the plugin to only files it created, fork and swap `drive` for `drive.file` in `src/auth.ts`.

## Skills (shipped with the plugin)

In addition to the 24 tools, this plugin ships an OpenClaw **skill** at [`skills/google-workspace/SKILL.md`](skills/google-workspace/SKILL.md). Skills are `SKILL.md` files that load into the agent's **system prompt** as an instructional layer — they don't compete with tools, they teach the agent *when* and *how* to use them.

The `google-workspace` skill is automatically discovered by OpenClaw when this plugin is enabled (gated via `plugins.entries.tangleclaw-google-oauth.enabled`). It encodes:

- A "rule zero" against narrating without calling — pushes the agent to invoke tools, not describe what it would do.
- An explicit "data changes between turns, always re-call" mandate — fixes the failure mode where the agent reuses an old result on a follow-up question.
- The Drive query syntax for folder traversal (`'<folder-id>' in parents`) — the agent often couldn't construct this on its own from tool descriptions alone.
- Multi-step workflow recipes for common operations: send-an-update-from-sheet, browse-photos-in-shared-subfolder, schedule-and-email, cleanup test artifacts.
- An explicit warning that `docs_append_text` is THE Google-Docs edit tool — not OpenClaw's built-in workspace `edit` tool (which is for local files only).
- A sharing-safety rule that prohibits volunteered `drive_permission_create` calls.

This is the durable fix for small-model tool-selection reliability. Description-only tuning was iterative and reactive; the skill loads once and biases agent behavior across all Workspace operations.

You can verify the skill is loaded after installing the plugin:

```bash
openclaw skills list | grep google-workspace
# → ✓ ready   🔐 google-workspace   Direct-OAuth Google Workspace operator skill...
```

For an *agent-level* verification (does the skill actually bias the agent's behavior the way it's supposed to?), paste the [skill verification prompt](docs/skill-verification-prompt.md) into a fresh agent chat. It runs six focused tests covering: never-narrate enforcement, re-call-on-followup, parent-id Drive query construction, edit-tool selection, sharing safety, and cleanup. Different from the smoke test — the smoke test confirms the *plugin* works, this confirms the *skill* is biasing the agent.

### If SKILL.md isn't reliably biasing your agent: inline the guidance into AGENTS.md

On smaller open-weights models (e.g. `qwen2.5-14b-instruct` and similar), the skill content sometimes loads but doesn't reliably bias agent behavior — the agent will name the right tools but defer to narrating ("I'll start by calling the OAuth flow...") instead of actually invoking them. This is a known weakness of smaller models at tool-calling, not a plugin defect.

If you observe this pattern, the highest-leverage fix on the operator side is to **inline the skill content into your workspace `AGENTS.md`** rather than relying on SKILL.md activation:

```bash
# On your OpenClaw node:
# Open the workspace AGENTS.md and append the relevant tool + rule guidance
# from skills/google-workspace/SKILL.md. The easiest path is to ask the
# agent itself: "Add full info about the openclaw-google-oauth tools and
# the google-workspace skill rules to your AGENTS.md so every session
# knows about them." (Verified to work on Volta 2026-05-26.)
$EDITOR ~/.openclaw/workspace/AGENTS.md
```

**Why this works:** `AGENTS.md` is loaded into every session's startup context unconditionally — no activation gate, no `requires.config` parsing, no skill-eligibility filtering. The same content that may sometimes fail to land via SKILL.md lands every time via AGENTS.md.

**Trade-offs:**

- **No auto-sync with plugin upgrades.** If this plugin ships a new version with new tools or rules, you'll need to manually update `AGENTS.md`. SKILL.md upgrades come for free when you bump the plugin.
- **Always in the prompt.** AGENTS.md content costs context tokens on every session, even sessions unrelated to Google Workspace. On a 1M-context model this is noise; on smaller-context deployments, weigh against other workspace content.
- **Workspace-scoped, not plugin-scoped.** Your edits live in `~/.openclaw/workspace/AGENTS.md` and get bunkered with the rest of your workspace. They survive container rebuilds and restore from the bunker repo, but they don't follow the plugin to a different deployment.

**Recommended pattern:** keep the plugin's `SKILL.md` as the baseline that everyone gets out of the box, and use `AGENTS.md` as your operator-side override when reliability matters more than portability. Larger models (Claude Haiku/Sonnet, GPT-4o-class) typically don't need the override; smaller open-weights models often do.

## Verify it works end-to-end

After completing the OAuth dance, paste the [end-to-end smoke test prompt](docs/smoke-test-prompt.md) into a fresh agent chat. It exercises every tool — sending mail, checking the inbox, creating + reading + editing a Google Doc, populating a Sheet, building a Slides deck, listing Drive files — and tells you exactly which step (if any) failed.

## The 7-day refresh-token expiry trap

While the OAuth app is in **Testing** status (the default after the initial setup), Google expires refresh tokens after **7 days**. After expiry, every API call returns `invalid_grant` and the agent silently stops working. You have two ways out:

### Option A — Re-run the OAuth dance weekly (free, manual)

Call `google_auth_start` from the agent, open the URL it returns, paste the `code=` value back via `google_auth_complete`. Done in ~30 seconds. Has to happen every week. Acceptable for a hobby setup; unworkable for unattended automation.

### Option B — Publish the OAuth app (one-time, then refresh tokens live indefinitely) ← recommended

This is the durable fix. **It does NOT give anyone else access to your data.** Publishing only changes two things:

1. The consent screen no longer shows "Google hasn't verified this app".
2. Refresh tokens issued after publishing have no expiry.

The security boundary is still your `gmail-token.json` file on your machine (mode 600). Random people can't authorize themselves into *your* Google account just because the app is published — they'd only ever get tokens for their own account, useless against your install.

**Step-by-step:**

1. <https://console.cloud.google.com/> → select your project (the one that owns the OAuth client).
2. APIs & Services → **OAuth consent screen** (or "Audience" in the newer UI).
3. Find **Publishing status** (will say "Testing"). Click **Publish App**.
4. A "Push to production?" modal appears. Click **Confirm**.
5. Google flags Gmail scopes as "restricted" — this is normal for `gmail.modify` and `gmail.send`. **For single-user self-use, no formal verification is required.** Acknowledge any restricted-scope notice and proceed.
6. Status now reads **In production**.
7. **Re-run the OAuth dance one more time** to get a fresh, indefinite-lifetime refresh token: call `google_auth_start`, open the URL, sign in, copy the `code=` value, call `google_auth_complete`. The new token replaces the old 7-day one.
8. Verify: <https://myaccount.google.com/permissions> — your app should be listed under "Apps with access to your account" with no expiry note.

After step 7, the token lives until you explicitly revoke it from the page in step 8.

### When you'd NOT want to publish

- You plan to add more than 100 users (then formal Google verification kicks in — that's slow and bureaucratic).
- You're testing a sensitive new scope and want extra safety from the test-user gate.
- Your org's policy requires Testing-only OAuth apps.

For a personal eBay-store / agent / hobby setup that authorizes a single Gmail account against itself, Publishing is the right move.

## More from @tangleclaw

- [`@tangleclaw/openclaw-ebay-research`](https://github.com/Jason-Vaughan/openclaw-ebay-research) — read-only eBay market research tools for your OpenClaw agent (search live listings, sold-history, category lookup) via direct OAuth. Useful alongside this plugin when your agent needs to email Gmail summaries of eBay research, drop a sold-price comparison into a Drive spreadsheet, or schedule a Calendar reminder around a listing window. Install: `openclaw plugins install clawhub:@tangleclaw/openclaw-ebay-research`.

## License

MIT
