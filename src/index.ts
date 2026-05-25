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
    "Direct-OAuth Google Workspace tools for OpenClaw — Gmail, Calendar, Drive, Docs, Sheets, Slides. No third-party gateway.",
  configSchema,
  tools: (tool) => [
    // ── OAuth setup ───────────────────────────────────────────────────────
    tool({
      name: "google_auth_start",
      label: "Start Google OAuth",
      description:
        "Returns the URL the user opens in a browser to authorize this app. Reads the client credentials from configured credentialsPath.",
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
        "Exchange the authorization code (from google_auth_start) for tokens. Writes a refresh-token-bearing token file to configured tokenPath.",
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
      description: "List messages matching a Gmail search query.",
      parameters: Type.Object({
        query: Type.Optional(
          Type.String({
            description:
              "Gmail search query (same syntax as the Gmail search bar). Example: 'is:unread newer_than:7d'",
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
      description: "Fetch a single Gmail message by id (full payload).",
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
        "Send an email from the authorized Gmail account (plain text body).",
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
      description: "Add and/or remove labels on a Gmail message.",
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

    // ── Calendar ──────────────────────────────────────────────────────────
    tool({
      name: "calendar_events_list",
      label: "List Calendar Events",
      description: "List events from a calendar.",
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
      description: "Create a new calendar event.",
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
      description: "Fetch a single calendar event by id.",
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

    // ── Drive ─────────────────────────────────────────────────────────────
    tool({
      name: "drive_files_list",
      label: "List Drive Files",
      description: "List Drive files matching a query (drive.file scope — only sees files this app created or was given access to).",
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
      description: "Get metadata for a single Drive file by id.",
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
      description: "Share a Drive file or folder with another user/group.",
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

    // ── Docs ──────────────────────────────────────────────────────────────
    tool({
      name: "docs_create",
      label: "Create Google Doc",
      description: "Create a new empty Google Doc with the given title.",
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
      description: "Fetch the full structured contents of a Google Doc.",
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
      label: "Append Text to Google Doc",
      description: "Append plain text to the end of a Google Doc.",
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
      description: "Create a new empty Google Spreadsheet with the given title.",
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
      description: "Get spreadsheet metadata (sheets list, title, etc.) without values.",
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
      description: "Read values from a sheet range (A1 notation, e.g. 'Sheet1!A1:C10').",
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
      description: "Append rows to a sheet range. values is a 2D array (rows of cells).",
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
      description: "Create a new empty Google Slides presentation with the given title.",
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
      description: "Fetch presentation structure (slides, layouts, etc.).",
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
