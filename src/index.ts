import { Type } from "typebox";
import { google } from "googleapis";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  AuthConfig,
  buildAuthUrl,
  createOAuthClient,
  exchangeCode,
  withTimeout,
} from "./auth.js";
import { encodeRfc2822 } from "./email.js";

const configSchema = Type.Object({
  credentialsPath: Type.String({
    default: "~/.openclaw/secrets/gmail-credentials.json",
    description:
      "Path to the OAuth client credentials JSON downloaded from Google Cloud Console (Desktop client).",
  }),
  tokenPath: Type.String({
    default: "~/.openclaw/secrets/gmail-token.json",
    description: "Path where the refresh token will be written + read.",
  }),
});

function authConfig(config: { credentialsPath: string; tokenPath: string }): AuthConfig {
  return {
    credentialsPath: config.credentialsPath,
    tokenPath: config.tokenPath,
  };
}

export default defineToolPlugin({
  id: "tangleclaw-google-oauth",
  name: "TangleClaw Google OAuth",
  description:
    "OpenClaw plugin for Google Workspace — Gmail (send/read/label), Calendar (events), Drive (list/share), Docs (create/read/append), Sheets (create/read/append), Slides (create/read) via direct OAuth. Your OAuth client talks straight to Google. No third-party gateway, no IMAP App Password.",
  configSchema,
  tools: (tool) => [
    // ── OAuth setup ───────────────────────────────────────────────────────
    tool({
      name: "google_auth_start",
      label: "Start Google OAuth",
      description:
        "Start a fresh Google OAuth authorization flow. Returns a URL the human must open in a browser to grant access. Only call this if the existing token has expired (invalid_grant errors) or if scopes need to be widened. Reads OAuth client credentials from configured credentialsPath.",
      parameters: Type.Object({}),
      async execute(_params, config) {
        const url = await buildAuthUrl(authConfig(config));
        return {
          authUrl: url,
          instructions:
            "Open authUrl in a browser, sign in with the target Google account, click through any 'unverified app' warning, grant the requested scopes, and copy the `code` query parameter from the redirected URL. Then call google_auth_complete with that code.",
        };
      },
    }),
    tool({
      name: "google_auth_complete",
      label: "Complete Google OAuth",
      description:
        "Finish Google OAuth authorization by exchanging the authorization code (the `code=` value from the redirect after google_auth_start) for an access + refresh token. Writes the token file so other Google tools can use it.",
      parameters: Type.Object({
        code: Type.String({
          description: "The `code` query parameter returned by Google after consent.",
        }),
      }),
      async execute({ code }, config) {
        const result = await exchangeCode(authConfig(config), code);
        return {
          ok: true,
          tokenPath: result.tokenPath,
          scopes: result.scopes,
        };
      },
    }),

    // ── Gmail ─────────────────────────────────────────────────────────────
    tool({
      name: "gmail_messages_list",
      label: "List Gmail Messages",
      description:
        "READ the Gmail inbox. ALWAYS call this tool — do not describe what you would do, do not reuse previous results — whenever the user asks to: check email, read inbox, see messages, look at recent mail, search emails, find a message, what mail did I get, any new email, what's in my inbox, did anything arrive, is there a reply yet. The inbox changes between calls (new mail arrives in real time), so always re-run a fresh query — never assume an earlier result is still current. Returns a list of message ids and snippets — call gmail_message_get with one of those ids to read the full body. Default returns the 10 most recent messages. Filter with Gmail search syntax: `is:unread`, `newer_than:1d`, `from:alice@example.com`, `subject:invoice`, `has:attachment`, `in:inbox`.",
      parameters: Type.Object({
        query: Type.Optional(
          Type.String({
            description:
              "Gmail search query (same syntax as the Gmail search bar). Examples: `is:unread`, `newer_than:7d`, `from:alice@example.com`, `subject:invoice`. Omit to get the most recent messages.",
          })
        ),
        maxResults: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 100, default: 10 })
        ),
      }),
      async execute({ query, maxResults }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const gmail = google.gmail({ version: "v1", auth });
        const res = await withTimeout(
          gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: maxResults ?? 10,
          }),
          "gmail.messages.list"
        );
        return {
          count: res.data.messages?.length ?? 0,
          nextPageToken: res.data.nextPageToken,
          messages: res.data.messages ?? [],
        };
      },
    }),
    tool({
      name: "gmail_message_get",
      label: "Get Gmail Message",
      description:
        "READ a Gmail message — fetch the full contents (from, subject, body, headers, attachments metadata) of one message by its id. Call this — do not narrate — when the user asks to read/show/view/open/see the contents of a specific email. Get the id from gmail_messages_list first.",
      parameters: Type.Object({
        id: Type.String({ description: "Gmail message id." }),
        format: Type.Optional(
          Type.Union(
            [
              Type.Literal("full"),
              Type.Literal("metadata"),
              Type.Literal("minimal"),
              Type.Literal("raw"),
            ],
            { default: "full" }
          )
        ),
      }),
      async execute({ id, format }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const gmail = google.gmail({ version: "v1", auth });
        const res = await withTimeout(
          gmail.users.messages.get({
            userId: "me",
            id,
            format: format ?? "full",
          }),
          "gmail.messages.get"
        );
        return res.data;
      },
    }),
    tool({
      name: "gmail_message_send",
      label: "Send Gmail Message",
      description:
        "Send an email through Gmail from the authorized account. Body is plain text. Use this to reply to people, send notifications, or share information by email.",
      parameters: Type.Object({
        to: Type.String({ description: "Recipient address (or comma-separated list)." }),
        subject: Type.String(),
        body: Type.String({ description: "Plain text body." }),
        cc: Type.Optional(Type.String()),
        bcc: Type.Optional(Type.String()),
        replyTo: Type.Optional(Type.String()),
      }),
      async execute(params, config) {
        const auth = await createOAuthClient(authConfig(config));
        const gmail = google.gmail({ version: "v1", auth });
        const raw = encodeRfc2822(params);
        const res = await withTimeout(
          gmail.users.messages.send({
            userId: "me",
            requestBody: { raw },
          }),
          "gmail.messages.send"
        );
        return { id: res.data.id, threadId: res.data.threadId };
      },
    }),
    tool({
      name: "gmail_message_modify",
      label: "Modify Gmail Labels",
      description:
        "Label, archive, mark-as-read, star, or trash a Gmail message. Common uses: mark read = removeLabelIds:[\"UNREAD\"]; archive = removeLabelIds:[\"INBOX\"]; star = addLabelIds:[\"STARRED\"]; trash = addLabelIds:[\"TRASH\"]; restore to inbox = addLabelIds:[\"INBOX\"].",
      parameters: Type.Object({
        id: Type.String(),
        addLabelIds: Type.Optional(Type.Array(Type.String())),
        removeLabelIds: Type.Optional(Type.Array(Type.String())),
      }),
      async execute({ id, addLabelIds, removeLabelIds }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const gmail = google.gmail({ version: "v1", auth });
        const res = await withTimeout(
          gmail.users.messages.modify({
            userId: "me",
            id,
            requestBody: {
              addLabelIds: addLabelIds ?? [],
              removeLabelIds: removeLabelIds ?? [],
            },
          }),
          "gmail.messages.modify"
        );
        return { id: res.data.id, labelIds: res.data.labelIds ?? [] };
      },
    }),
    tool({
      name: "gmail_message_trash",
      label: "Trash Gmail Message",
      description:
        "DELETE / TRASH / REMOVE a Gmail message by id. Moves the message to Gmail's Trash folder — recoverable for 30 days, then auto-purged by Google. Use this to clean up messages. (For a permanent immediate delete, manage from the Gmail UI.)",
      parameters: Type.Object({
        id: Type.String({ description: "Gmail message id (from gmail_messages_list)." }),
      }),
      async execute({ id }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const gmail = google.gmail({ version: "v1", auth });
        const res = await withTimeout(
          gmail.users.messages.trash({ userId: "me", id }),
          "gmail.messages.trash"
        );
        return { id: res.data.id, labelIds: res.data.labelIds ?? [] };
      },
    }),

    // ── Calendar ──────────────────────────────────────────────────────────
    tool({
      name: "calendar_events_list",
      label: "List Calendar Events",
      description:
        "READ events from the Google Calendar. ALWAYS call this tool — do not narrate, do not reuse previous results — whenever the user asks to: see, view, read, show, list, check, fetch, find, look up, look at, browse, what's on the calendar, what events I have, what's scheduled, what appointments / meetings / events are coming up, what events were added, what's on the schedule today/tomorrow/this week, did the user just add something to the calendar. The calendar changes between calls (the user adds/removes events between turns), so always re-run a fresh query — never assume an earlier result is still current. Returns events in time order from the primary calendar (default), next 25 (default). To include past events, pass `timeMin` like `2020-01-01T00:00:00Z`. To filter a specific day or range, pass `timeMin` and `timeMax` (RFC3339).",
      parameters: Type.Object({
        calendarId: Type.Optional(Type.String({ default: "primary" })),
        timeMin: Type.Optional(
          Type.String({ description: "RFC3339 lower bound (e.g. 2026-06-01T00:00:00Z)." })
        ),
        timeMax: Type.Optional(Type.String({ description: "RFC3339 upper bound." })),
        maxResults: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 250, default: 25 })
        ),
        singleEvents: Type.Optional(Type.Boolean({ default: true })),
      }),
      async execute(params, config) {
        const auth = await createOAuthClient(authConfig(config));
        const calendar = google.calendar({ version: "v3", auth });
        const res = await withTimeout(
          calendar.events.list({
            calendarId: params.calendarId ?? "primary",
            timeMin: params.timeMin,
            timeMax: params.timeMax,
            maxResults: params.maxResults ?? 25,
            singleEvents: params.singleEvents ?? true,
            orderBy: "startTime",
          }),
          "calendar.events.list"
        );
        return {
          count: res.data.items?.length ?? 0,
          events: res.data.items ?? [],
        };
      },
    }),
    tool({
      name: "calendar_event_create",
      label: "Create Calendar Event",
      description:
        "Schedule a new event on the Google Calendar / add an event / book time / set up a meeting / make a reminder. Times are RFC3339 (e.g. 2026-06-01T14:00:00-07:00). Defaults to the primary calendar. Pass attendees as a list of email addresses.",
      parameters: Type.Object({
        calendarId: Type.Optional(Type.String({ default: "primary" })),
        summary: Type.String(),
        description: Type.Optional(Type.String()),
        location: Type.Optional(Type.String()),
        start: Type.String({
          description: "RFC3339 start datetime (e.g. 2026-06-01T14:00:00-07:00).",
        }),
        end: Type.String({ description: "RFC3339 end datetime." }),
        attendees: Type.Optional(Type.Array(Type.String())),
      }),
      async execute(params, config) {
        const auth = await createOAuthClient(authConfig(config));
        const calendar = google.calendar({ version: "v3", auth });
        const res = await withTimeout(
          calendar.events.insert({
            calendarId: params.calendarId ?? "primary",
            requestBody: {
              summary: params.summary,
              description: params.description,
              location: params.location,
              start: { dateTime: params.start },
              end: { dateTime: params.end },
              attendees: params.attendees?.map((email) => ({ email })),
            },
          }),
          "calendar.events.insert"
        );
        return {
          id: res.data.id,
          htmlLink: res.data.htmlLink,
          status: res.data.status,
        };
      },
    }),
    tool({
      name: "calendar_event_get",
      label: "Get Calendar Event",
      description:
        "READ the full details of one Google Calendar event by id (summary, description, time, attendees, location). Call this — do not narrate — when the user asks to see/view/read/show/look at a specific calendar event. Get the id from calendar_events_list first.",
      parameters: Type.Object({
        calendarId: Type.Optional(Type.String({ default: "primary" })),
        eventId: Type.String(),
      }),
      async execute({ calendarId, eventId }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const calendar = google.calendar({ version: "v3", auth });
        const res = await withTimeout(
          calendar.events.get({
            calendarId: calendarId ?? "primary",
            eventId,
          }),
          "calendar.events.get"
        );
        return res.data;
      },
    }),
    tool({
      name: "calendar_event_delete",
      label: "Delete Calendar Event",
      description:
        "DELETE / REMOVE / CANCEL a Google Calendar event by id. Recoverable from Google Calendar's Trash for ~30 days. Get the event id from calendar_events_list first. Defaults to the primary calendar.",
      parameters: Type.Object({
        calendarId: Type.Optional(Type.String({ default: "primary" })),
        eventId: Type.String({ description: "Event id (from calendar_events_list)." }),
      }),
      async execute({ calendarId, eventId }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const calendar = google.calendar({ version: "v3", auth });
        await withTimeout(
          calendar.events.delete({
            calendarId: calendarId ?? "primary",
            eventId,
          }),
          "calendar.events.delete"
        );
        return { ok: true, deletedEventId: eventId };
      },
    }),

    // ── Drive ─────────────────────────────────────────────────────────────
    tool({
      name: "drive_files_list",
      label: "List Drive Files",
      description:
        "READ / LIST Google Drive files and folders. ALWAYS call this tool — do not narrate, do not assume previous results are still current — when the user asks to: see/list/show/find/browse/search files in Drive, what files are there, what docs/sheets/slides did I create, what folders has the user shared with me, look for a file, what's IN this folder, what's in the subfolder, did the user just add something, do you see the new file, is anything new. The Drive contents change between calls (the user adds/removes files between turns), so always re-run a fresh query — never reuse a previous result. To find folder contents (most common follow-up): `'<folder-id>' in parents` (literal single quotes around the folder id). To find a folder by name: `mimeType='application/vnd.google-apps.folder' and name='eBay_Photos'`. Other query examples: `mimeType='application/vnd.google-apps.spreadsheet'`, `name contains 'invoice'`, `sharedWithMe = true`. Omit query for the 25 most recent files overall. Sees the authorized account's entire Drive: files the app created, files shared with the account, files in shared folders. Per-file Google ACLs decide what's read-only vs writable.",
      parameters: Type.Object({
        query: Type.Optional(
          Type.String({
            description:
              "Drive query syntax. Example: \"mimeType='application/vnd.google-apps.spreadsheet'\"",
          })
        ),
        pageSize: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 1000, default: 25 })
        ),
      }),
      async execute({ query, pageSize }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const drive = google.drive({ version: "v3", auth });
        const res = await withTimeout(
          drive.files.list({
            q: query,
            pageSize: pageSize ?? 25,
            fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)",
          }),
          "drive.files.list"
        );
        return {
          count: res.data.files?.length ?? 0,
          nextPageToken: res.data.nextPageToken,
          files: res.data.files ?? [],
        };
      },
    }),
    tool({
      name: "drive_file_get",
      label: "Get Drive File Metadata",
      description:
        "READ / VIEW / fetch metadata (name, mimeType, parents folder, owners, size, sharing link, modifiedTime) for one Google Drive file by id. Does not return file contents — use the per-type tools (docs_get, sheets_values_get, slides_get) to read actual contents.",
      parameters: Type.Object({
        fileId: Type.String(),
      }),
      async execute({ fileId }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const drive = google.drive({ version: "v3", auth });
        const res = await withTimeout(
          drive.files.get({
            fileId,
            fields: "id, name, mimeType, modifiedTime, webViewLink, owners, parents, size",
          }),
          "drive.files.get"
        );
        return res.data;
      },
    }),
    tool({
      name: "drive_permission_create",
      label: "Share Drive File",
      description:
        "Share a Google Drive file, folder, Doc, Sheet, or Slides presentation with another person by email address. Role: `reader` (view only), `commenter` (view + comment), or `writer` (full edit).",
      parameters: Type.Object({
        fileId: Type.String(),
        emailAddress: Type.String(),
        role: Type.Union(
          [
            Type.Literal("reader"),
            Type.Literal("commenter"),
            Type.Literal("writer"),
          ],
          { default: "reader" }
        ),
        type: Type.Optional(
          Type.Union(
            [Type.Literal("user"), Type.Literal("group")],
            { default: "user" }
          )
        ),
        sendNotificationEmail: Type.Optional(Type.Boolean({ default: false })),
      }),
      async execute(params, config) {
        const auth = await createOAuthClient(authConfig(config));
        const drive = google.drive({ version: "v3", auth });
        const res = await withTimeout(
          drive.permissions.create({
            fileId: params.fileId,
            sendNotificationEmail: params.sendNotificationEmail ?? false,
            requestBody: {
              type: params.type ?? "user",
              role: params.role,
              emailAddress: params.emailAddress,
            },
          }),
          "drive.permissions.create"
        );
        return res.data;
      },
    }),
    tool({
      name: "drive_file_trash",
      label: "Trash Drive File",
      description:
        "DELETE / TRASH / REMOVE a Google Drive file, folder, Doc, Sheet, or Slides presentation by id. Moves the file to Drive's Trash — recoverable for 30 days, then auto-purged by Google. Use this to clean up files this app created. (For an immediate permanent delete, manage from Drive UI or call this and empty the trash there.)",
      parameters: Type.Object({
        fileId: Type.String({ description: "Drive file id (from drive_files_list or the corresponding create tool's response)." }),
      }),
      async execute({ fileId }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const drive = google.drive({ version: "v3", auth });
        const res = await withTimeout(
          drive.files.update({
            fileId,
            requestBody: { trashed: true },
            fields: "id, trashed",
          }),
          "drive.files.update(trashed=true)"
        );
        return { ok: true, trashedFileId: res.data.id };
      },
    }),

    // ── Docs ──────────────────────────────────────────────────────────────
    tool({
      name: "docs_create",
      label: "Create Google Doc",
      description:
        "Create a new empty Google Doc (Google Docs document) with the given title. Returns the documentId and a docs.google.com URL. To add content, call docs_append_text with that documentId — never use the workspace `edit` tool on a Google Doc (it's for local files only).",
      parameters: Type.Object({
        title: Type.String(),
      }),
      async execute({ title }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const docs = google.docs({ version: "v1", auth });
        const res = await withTimeout(
          docs.documents.create({ requestBody: { title } }),
          "docs.documents.create"
        );
        return {
          documentId: res.data.documentId,
          title: res.data.title,
          documentUrl: `https://docs.google.com/document/d/${res.data.documentId}/edit`,
        };
      },
    }),
    tool({
      name: "docs_get",
      label: "Get Google Doc",
      description:
        "READ the full structured contents of a Google Doc by documentId — paragraphs, headings, tables, formatting. ALWAYS call this tool — do not narrate, do not reuse previous results — when the user asks to read/view/fetch/show/open/see what a Google Doc says, OR asks whether the doc was updated / has new content. Doc contents change between calls — always re-run a fresh query.",
      parameters: Type.Object({
        documentId: Type.String(),
      }),
      async execute({ documentId }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const docs = google.docs({ version: "v1", auth });
        const res = await withTimeout(
          docs.documents.get({ documentId }),
          "docs.documents.get"
        );
        return res.data;
      },
    }),
    tool({
      name: "docs_append_text",
      label: "Edit Google Doc (Append Text)",
      description:
        "Edit / write to / add content to / modify / update an existing Google Doc by appending plain text to the end. THIS is the tool for any change to a Google Doc — do NOT use the workspace `edit` tool (that's for local files only, it cannot edit Google Docs). Pass the documentId (from docs_create or drive_files_list), not a file path. Use after docs_create to populate a new Google Doc.",
      parameters: Type.Object({
        documentId: Type.String(),
        text: Type.String(),
      }),
      async execute({ documentId, text }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const docs = google.docs({ version: "v1", auth });
        const docRes = await withTimeout(
          docs.documents.get({ documentId, fields: "body(content(endIndex))" }),
          "docs.documents.get"
        );
        const content = docRes.data.body?.content ?? [];
        const endIndex =
          (content[content.length - 1]?.endIndex ?? 1) - 1;
        const res = await withTimeout(
          docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [
                {
                  insertText: {
                    location: { index: Math.max(endIndex, 1) },
                    text,
                  },
                },
              ],
            },
          }),
          "docs.documents.batchUpdate"
        );
        return { ok: true, replies: res.data.replies?.length ?? 0 };
      },
    }),

    // ── Sheets ────────────────────────────────────────────────────────────
    tool({
      name: "sheets_create",
      label: "Create Google Sheet",
      description:
        "Create a new empty Google Sheet (Google Sheets spreadsheet) with the given title. Returns the spreadsheetId and a docs.google.com URL. Follow up with sheets_values_append to add rows.",
      parameters: Type.Object({
        title: Type.String(),
      }),
      async execute({ title }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const sheets = google.sheets({ version: "v4", auth });
        const res = await withTimeout(
          sheets.spreadsheets.create({
            requestBody: { properties: { title } },
          }),
          "sheets.spreadsheets.create"
        );
        return {
          spreadsheetId: res.data.spreadsheetId,
          spreadsheetUrl: res.data.spreadsheetUrl,
        };
      },
    }),
    tool({
      name: "sheets_get",
      label: "Get Spreadsheet Metadata",
      description:
        "READ metadata for a Google Sheet (list of sheet/tab names, properties, title) — does NOT return cell values. For actual cell values, use sheets_values_get.",
      parameters: Type.Object({
        spreadsheetId: Type.String(),
      }),
      async execute({ spreadsheetId }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const sheets = google.sheets({ version: "v4", auth });
        const res = await withTimeout(
          sheets.spreadsheets.get({ spreadsheetId }),
          "sheets.spreadsheets.get"
        );
        return res.data;
      },
    }),
    tool({
      name: "sheets_values_get",
      label: "Read Sheet Values",
      description:
        "READ cell values from a Google Sheet. ALWAYS call this tool — do not narrate, do not reuse previous results — when the user asks to see/read/fetch/show/look at/view data in a spreadsheet or the contents of a sheet, OR asks whether the sheet changed / has new data / was updated. Sheet contents change between calls — always re-run a fresh query. Range is A1 notation: `Sheet1!A1:C10` (a rectangle), `Sheet1!A:A` (whole column A), `Sheet1` (all data on a tab). Returns a 2D array of cell values.",
      parameters: Type.Object({
        spreadsheetId: Type.String(),
        range: Type.String(),
      }),
      async execute({ spreadsheetId, range }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const sheets = google.sheets({ version: "v4", auth });
        const res = await withTimeout(
          sheets.spreadsheets.values.get({ spreadsheetId, range }),
          "sheets.spreadsheets.values.get"
        );
        return res.data;
      },
    }),
    tool({
      name: "sheets_values_append",
      label: "Append Sheet Values",
      description:
        "Append / add rows of data to a Google Sheet. `values` is a 2D array — each inner array is one row of cells. Use after sheets_create to populate a new spreadsheet, or to log new rows into an existing sheet.",
      parameters: Type.Object({
        spreadsheetId: Type.String(),
        range: Type.String({ description: "A1 notation (e.g. 'Sheet1!A1')." }),
        values: Type.Array(Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]))),
        valueInputOption: Type.Optional(
          Type.Union(
            [Type.Literal("RAW"), Type.Literal("USER_ENTERED")],
            { default: "USER_ENTERED" }
          )
        ),
      }),
      async execute(params, config) {
        const auth = await createOAuthClient(authConfig(config));
        const sheets = google.sheets({ version: "v4", auth });
        const res = await withTimeout(
          sheets.spreadsheets.values.append({
            spreadsheetId: params.spreadsheetId,
            range: params.range,
            valueInputOption: params.valueInputOption ?? "USER_ENTERED",
            requestBody: { values: params.values },
          }),
          "sheets.spreadsheets.values.append"
        );
        return res.data;
      },
    }),

    // ── Slides ────────────────────────────────────────────────────────────
    tool({
      name: "slides_create",
      label: "Create Google Slides Presentation",
      description:
        "Create a new empty Google Slides presentation with the given title. Returns the presentationId and a docs.google.com URL.",
      parameters: Type.Object({
        title: Type.String(),
      }),
      async execute({ title }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const slides = google.slides({ version: "v1", auth });
        const res = await withTimeout(
          slides.presentations.create({ requestBody: { title } }),
          "slides.presentations.create"
        );
        return {
          presentationId: res.data.presentationId,
          presentationUrl: `https://docs.google.com/presentation/d/${res.data.presentationId}/edit`,
        };
      },
    }),
    tool({
      name: "slides_get",
      label: "Get Slides Presentation",
      description:
        "READ the structure of a Google Slides presentation by presentationId — slides, layouts, text content. Call this — do not narrate — when the user asks to see/view/read/show/look at the contents of a presentation.",
      parameters: Type.Object({
        presentationId: Type.String(),
      }),
      async execute({ presentationId }, config) {
        const auth = await createOAuthClient(authConfig(config));
        const slides = google.slides({ version: "v1", auth });
        const res = await withTimeout(
          slides.presentations.get({ presentationId }),
          "slides.presentations.get"
        );
        return res.data;
      },
    }),
  ],
});
