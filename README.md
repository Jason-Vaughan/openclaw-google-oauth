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
```

Or for local dev (e.g. cloned this repo):

```bash
cd openclaw-google-oauth
npm install
npm run plugin:build
openclaw plugins install /path/to/openclaw-google-oauth
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

Have your agent call `google_auth_start`. It returns a URL. Open it, sign in, grant access, copy the `code=` query parameter from the redirected URL, then call `google_auth_complete` with that code. A `gmail-token.json` file is written to `~/.openclaw/secrets/` (or `tokenPath` if overridden).

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

## License

MIT
