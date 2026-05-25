# @tangleclaw/openclaw-google-oauth

**Google Workspace tools for [OpenClaw](https://openclaw.ai) — Gmail, Calendar, Drive, Docs, Sheets, Slides — via direct OAuth.** Your OAuth client talks straight to `googleapis.com`. No third-party gateway. No IMAP/App Password workaround.

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

A single OpenClaw plugin that exposes ~20 agent-callable tools spanning six Google APIs from one OAuth client:

| Family | Tools |
|---|---|
| OAuth | `google_auth_start`, `google_auth_complete` |
| Gmail | `gmail_messages_list`, `gmail_message_get`, `gmail_message_send`, `gmail_message_modify` |
| Calendar | `calendar_events_list`, `calendar_event_create`, `calendar_event_get` |
| Drive | `drive_files_list`, `drive_file_get`, `drive_permission_create` |
| Docs | `docs_create`, `docs_get`, `docs_append_text` |
| Sheets | `sheets_create`, `sheets_get`, `sheets_values_get`, `sheets_values_append` |
| Slides | `slides_create`, `slides_get` |

## Why direct OAuth?

Other Google plugins on ClawHub either:

- Use **App Passwords over IMAP/SMTP** (Gmail-only, no Workspace coverage), or
- Route through a **third-party SaaS gateway** (your mail/docs traffic passes through them, you authorize *their* OAuth app).

This plugin uses **your own OAuth client** talking **directly** to Google. Trust boundary is just you and Google.

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
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/presentations
```

`drive.file` is the *minimal* Drive scope — the plugin only sees files it created or was explicitly given access to. If you need broader Drive access, fork and add the scope you want.

## The 7-day refresh-token expiry trap

While the OAuth app is in **TESTING** status, Google expires refresh tokens after 7 days. You'll see `invalid_grant` errors. To fix:

- **Option A (free, simple):** re-run `google_auth_start` weekly.
- **Option B (recommended for unattended use):** publish the app to **PRODUCTION** in the OAuth consent screen. Single-user self-use does not require Google verification; refresh tokens live indefinitely.

## License

MIT
