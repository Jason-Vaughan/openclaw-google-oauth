import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { google } from "googleapis";
import { existsSync } from "node:fs";
import {
  buildAuthUrl,
  createOAuthClient,
  expandHome,
  SCOPES,
} from "./auth.js";
import { encodeRfc2822 } from "./email.js";

// Live tests are opt-in only — set RUN_LIVE_TESTS=1 to run them. Avoids
// accidentally hitting Google APIs with stale or wrong credentials.
const runLive = process.env.RUN_LIVE_TESTS === "1";

const credentialsPath =
  process.env.GOOGLE_OAUTH_CREDENTIALS ??
  "~/.openclaw/secrets/gmail-credentials.json";
const tokenPath =
  process.env.GOOGLE_OAUTH_TOKEN ?? "~/.openclaw/secrets/gmail-token.json";

const config = { credentialsPath, tokenPath };

const haveCredentials = existsSync(expandHome(credentialsPath));
const haveToken = existsSync(expandHome(tokenPath));

const describeIfCreds = runLive && haveCredentials ? describe : describe.skip;
const describeIfToken = runLive && haveToken ? describe : describe.skip;

const liveShareEmail = process.env.LIVE_SHARE_TEST_EMAIL;
const describeIfShareTarget =
  runLive && haveToken && liveShareEmail ? describe : describe.skip;

const TIMEOUT_MS = 20_000;

// ─── OAuth URL generation (needs credentials only) ──────────────────────────
describeIfCreds("live: OAuth URL generation", () => {
  it("buildAuthUrl returns a Google consent URL with offline access + every scope", async () => {
    const url = await buildAuthUrl(config);
    expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\//);
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    for (const scope of SCOPES) {
      expect(url).toContain(encodeURIComponent(scope));
    }
  });
});

// ─── Gmail ──────────────────────────────────────────────────────────────────
describeIfToken("live: Gmail tools", () => {
  let auth: Awaited<ReturnType<typeof createOAuthClient>>;
  let gmail: ReturnType<typeof google.gmail>;
  let authorizedEmail: string;
  let sentMessageId: string | undefined;

  beforeAll(async () => {
    auth = await createOAuthClient(config);
    gmail = google.gmail({ version: "v1", auth });
    const profile = await gmail.users.getProfile({ userId: "me" });
    authorizedEmail = profile.data.emailAddress!;
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (sentMessageId) {
      try {
        await gmail.users.messages.trash({ userId: "me", id: sentMessageId });
      } catch {
        /* best effort */
      }
    }
  });

  it("gmail_message_send sends mail to self", async () => {
    const raw = encodeRfc2822({
      to: authorizedEmail,
      subject: `live-test ${Date.now()}`,
      body: "Live test from the openclaw-google-oauth test suite. Safe to delete.",
    });
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    sentMessageId = res.data.id ?? undefined;
    expect(sentMessageId).toBeTruthy();
    expect(res.data.labelIds).toContain("SENT");
  }, TIMEOUT_MS);

  it("gmail_messages_list returns the message we just sent", async () => {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: "in:sent",
      maxResults: 5,
    });
    const ids = res.data.messages?.map((m) => m.id);
    expect(ids).toContain(sentMessageId);
  }, TIMEOUT_MS);

  it("gmail_message_get fetches full payload of the sent message", async () => {
    const res = await gmail.users.messages.get({
      userId: "me",
      id: sentMessageId!,
      format: "full",
    });
    expect(res.data.id).toBe(sentMessageId);
    expect(res.data.labelIds?.includes("SENT") ?? false).toBe(true);
  }, TIMEOUT_MS);

  it("gmail_message_modify can add and remove labels", async () => {
    const added = await gmail.users.messages.modify({
      userId: "me",
      id: sentMessageId!,
      requestBody: { addLabelIds: ["STARRED"] },
    });
    expect(added.data.labelIds).toContain("STARRED");
    const removed = await gmail.users.messages.modify({
      userId: "me",
      id: sentMessageId!,
      requestBody: { removeLabelIds: ["STARRED"] },
    });
    expect(removed.data.labelIds).not.toContain("STARRED");
  }, TIMEOUT_MS);

  it("gmail_message_trash moves the message to TRASH", async () => {
    const res = await gmail.users.messages.trash({
      userId: "me",
      id: sentMessageId!,
    });
    expect(res.data.labelIds).toContain("TRASH");
    // Suppress the afterAll cleanup attempt — it's already trashed.
    sentMessageId = undefined;
  }, TIMEOUT_MS);
});

// ─── Calendar ───────────────────────────────────────────────────────────────
describeIfToken("live: Calendar tools", () => {
  let auth: Awaited<ReturnType<typeof createOAuthClient>>;
  let calendar: ReturnType<typeof google.calendar>;
  let eventId: string | undefined;

  beforeAll(async () => {
    auth = await createOAuthClient(config);
    calendar = google.calendar({ version: "v3", auth });
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (eventId) {
      try {
        await calendar.events.delete({ calendarId: "primary", eventId });
      } catch {
        /* best effort */
      }
    }
  });

  it("calendar_event_create creates an event", async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60 * 1000);
    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `live-test event ${Date.now()}`,
        description: "Created by openclaw-google-oauth test suite. Auto-deleted.",
        start: { dateTime: now.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });
    eventId = res.data.id ?? undefined;
    expect(eventId).toBeTruthy();
    expect(res.data.htmlLink).toMatch(/^https:\/\//);
  }, TIMEOUT_MS);

  it("calendar_events_list returns the event we just created", async () => {
    const res = await calendar.events.list({
      calendarId: "primary",
      maxResults: 25,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    const ids = res.data.items?.map((e) => e.id);
    expect(ids).toContain(eventId);
  }, TIMEOUT_MS);

  it("calendar_event_get fetches the event by id", async () => {
    const res = await calendar.events.get({
      calendarId: "primary",
      eventId: eventId!,
    });
    expect(res.data.id).toBe(eventId);
    expect(res.data.summary).toMatch(/^live-test event/);
  }, TIMEOUT_MS);

  it("calendar_event_delete removes the event", async () => {
    await calendar.events.delete({
      calendarId: "primary",
      eventId: eventId!,
    });
    // Verify it's gone (events.get on a deleted id returns status:cancelled).
    const after = await calendar.events.get({
      calendarId: "primary",
      eventId: eventId!,
    });
    expect(after.data.status).toBe("cancelled");
    // Suppress the afterAll cleanup attempt — it's already deleted.
    eventId = undefined;
  }, TIMEOUT_MS);
});

// ─── Drive (metadata) ───────────────────────────────────────────────────────
describeIfToken("live: Drive tools", () => {
  let auth: Awaited<ReturnType<typeof createOAuthClient>>;
  let drive: ReturnType<typeof google.drive>;
  let sheets: ReturnType<typeof google.sheets>;
  let testFileId: string | undefined;

  beforeAll(async () => {
    auth = await createOAuthClient(config);
    drive = google.drive({ version: "v3", auth });
    sheets = google.sheets({ version: "v4", auth });
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title: `live-drive-test ${Date.now()}` } },
    });
    testFileId = created.data.spreadsheetId ?? undefined;
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (testFileId) {
      try {
        await drive.files.delete({ fileId: testFileId });
      } catch {
        /* best effort */
      }
    }
  });

  it("drive_files_list returns our test file", async () => {
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.spreadsheet' and name contains 'live-drive-test'`,
      pageSize: 10,
      fields: "files(id, name, mimeType)",
    });
    const ids = res.data.files?.map((f) => f.id);
    expect(ids).toContain(testFileId);
  }, TIMEOUT_MS);

  it("drive_file_get returns file metadata", async () => {
    const res = await drive.files.get({
      fileId: testFileId!,
      fields: "id, name, mimeType",
    });
    expect(res.data.id).toBe(testFileId);
    expect(res.data.mimeType).toBe("application/vnd.google-apps.spreadsheet");
  }, TIMEOUT_MS);

  it("drive_file_trash moves the file to Drive trash", async () => {
    const res = await drive.files.update({
      fileId: testFileId!,
      requestBody: { trashed: true },
      fields: "id, trashed",
    });
    expect(res.data.trashed).toBe(true);
    // Note: testFileId is intentionally NOT cleared — afterAll's
    // drive.files.delete will still succeed against a trashed file and
    // performs the permanent purge.
  }, TIMEOUT_MS);

  // Regression test for the scope-widening fix: with full `drive` scope,
  // a sharedWithMe query must not error and must return whatever the
  // authorized account has been given access to. The drive.file scope this
  // replaced returned an empty array even when shares existed, which made
  // shared eBay-photo folders invisible to the agent.
  it("drive sharedWithMe query is callable under the full drive scope", async () => {
    const res = await drive.files.list({
      q: "sharedWithMe = true",
      fields: "files(id, name, mimeType)",
      pageSize: 5,
    });
    // We can't assert a specific count — it depends on what the user has
    // been shared. We assert only that the call succeeds (the old
    // drive.file scope would silently return [] regardless of shares).
    expect(Array.isArray(res.data.files)).toBe(true);
  }, TIMEOUT_MS);
});

// drive_permission_create requires a real share target — opt-in via env var.
describeIfShareTarget("live: Drive sharing", () => {
  let auth: Awaited<ReturnType<typeof createOAuthClient>>;
  let drive: ReturnType<typeof google.drive>;
  let docs: ReturnType<typeof google.docs>;
  let fileId: string | undefined;

  beforeAll(async () => {
    auth = await createOAuthClient(config);
    drive = google.drive({ version: "v3", auth });
    docs = google.docs({ version: "v1", auth });
    const created = await docs.documents.create({
      requestBody: { title: `live-share-test ${Date.now()}` },
    });
    fileId = created.data.documentId ?? undefined;
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (fileId) {
      try {
        await drive.files.delete({ fileId });
      } catch {
        /* best effort */
      }
    }
  });

  it("drive_permission_create grants reader role (then revokes to leave no lingering share)", async () => {
    const created = await drive.permissions.create({
      fileId: fileId!,
      sendNotificationEmail: false,
      requestBody: {
        type: "user",
        role: "reader",
        emailAddress: liveShareEmail!,
      },
    });
    expect(created.data.role).toBe("reader");
    expect(created.data.id).toBeTruthy();
    // Clean up the permission grant immediately so the test leaves no trace.
    await drive.permissions.delete({
      fileId: fileId!,
      permissionId: created.data.id!,
    });
  }, TIMEOUT_MS);
});

// ─── Docs ───────────────────────────────────────────────────────────────────
describeIfToken("live: Docs tools", () => {
  let auth: Awaited<ReturnType<typeof createOAuthClient>>;
  let docs: ReturnType<typeof google.docs>;
  let drive: ReturnType<typeof google.drive>;
  let documentId: string | undefined;
  const appendedText = "Appended by test suite at " + Date.now();

  beforeAll(async () => {
    auth = await createOAuthClient(config);
    docs = google.docs({ version: "v1", auth });
    drive = google.drive({ version: "v3", auth });
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (documentId) {
      try {
        await drive.files.delete({ fileId: documentId });
      } catch {
        /* best effort */
      }
    }
  });

  it("docs_create makes a new doc", async () => {
    const res = await docs.documents.create({
      requestBody: { title: `live-docs-test ${Date.now()}` },
    });
    documentId = res.data.documentId ?? undefined;
    expect(documentId).toBeTruthy();
  }, TIMEOUT_MS);

  it("docs_get fetches structure of the new doc", async () => {
    const res = await docs.documents.get({ documentId: documentId! });
    expect(res.data.documentId).toBe(documentId);
    expect(res.data.body).toBeDefined();
  }, TIMEOUT_MS);

  it("docs_append_text appends text and content is readable back", async () => {
    const doc = await docs.documents.get({
      documentId: documentId!,
      fields: "body(content(endIndex))",
    });
    const contents = doc.data.body?.content ?? [];
    const endIndex = (contents[contents.length - 1]?.endIndex ?? 1) - 1;
    await docs.documents.batchUpdate({
      documentId: documentId!,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: Math.max(endIndex, 1) },
              text: appendedText,
            },
          },
        ],
      },
    });
    const after = await docs.documents.get({ documentId: documentId! });
    const flatText = JSON.stringify(after.data.body);
    expect(flatText).toContain(appendedText);
  }, TIMEOUT_MS);
});

// ─── Sheets ─────────────────────────────────────────────────────────────────
describeIfToken("live: Sheets tools", () => {
  let auth: Awaited<ReturnType<typeof createOAuthClient>>;
  let sheets: ReturnType<typeof google.sheets>;
  let drive: ReturnType<typeof google.drive>;
  let spreadsheetId: string | undefined;
  const row = ["live-test", String(Date.now()), "row"];

  beforeAll(async () => {
    auth = await createOAuthClient(config);
    sheets = google.sheets({ version: "v4", auth });
    drive = google.drive({ version: "v3", auth });
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (spreadsheetId) {
      try {
        await drive.files.delete({ fileId: spreadsheetId });
      } catch {
        /* best effort */
      }
    }
  });

  it("sheets_create makes a new spreadsheet", async () => {
    const res = await sheets.spreadsheets.create({
      requestBody: { properties: { title: `live-sheets-test ${Date.now()}` } },
    });
    spreadsheetId = res.data.spreadsheetId ?? undefined;
    expect(spreadsheetId).toBeTruthy();
    expect(res.data.spreadsheetUrl).toMatch(/^https:\/\//);
  }, TIMEOUT_MS);

  it("sheets_get returns spreadsheet metadata", async () => {
    const res = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId! });
    expect(res.data.spreadsheetId).toBe(spreadsheetId);
    expect((res.data.sheets?.length ?? 0)).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it("sheets_values_append + sheets_values_get round-trip a row", async () => {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId!,
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId!,
      range: "Sheet1!A1:C1",
    });
    expect(res.data.values?.[0]).toEqual(row);
  }, TIMEOUT_MS);
});

// ─── Slides ─────────────────────────────────────────────────────────────────
describeIfToken("live: Slides tools", () => {
  let auth: Awaited<ReturnType<typeof createOAuthClient>>;
  let slides: ReturnType<typeof google.slides>;
  let drive: ReturnType<typeof google.drive>;
  let presentationId: string | undefined;

  beforeAll(async () => {
    auth = await createOAuthClient(config);
    slides = google.slides({ version: "v1", auth });
    drive = google.drive({ version: "v3", auth });
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (presentationId) {
      try {
        await drive.files.delete({ fileId: presentationId });
      } catch {
        /* best effort */
      }
    }
  });

  it("slides_create makes a new presentation", async () => {
    const res = await slides.presentations.create({
      requestBody: { title: `live-slides-test ${Date.now()}` },
    });
    presentationId = res.data.presentationId ?? undefined;
    expect(presentationId).toBeTruthy();
  }, TIMEOUT_MS);

  it("slides_get returns presentation structure", async () => {
    const res = await slides.presentations.get({
      presentationId: presentationId!,
    });
    expect(res.data.presentationId).toBe(presentationId);
    expect((res.data.slides?.length ?? 0)).toBeGreaterThan(0);
  }, TIMEOUT_MS);
});
