import { describe, it, expect } from "vitest";
import { google } from "googleapis";
import { buildAuthUrl, createOAuthClient, expandHome } from "./auth.js";
import { existsSync } from "node:fs";

// Live tests are opt-in only — set RUN_LIVE_TESTS=1 to run them.
// Avoids accidentally hitting Google APIs with stale or wrong credentials.
const runLive = process.env.RUN_LIVE_TESTS === "1";

const credentialsPath =
  process.env.GOOGLE_OAUTH_CREDENTIALS ?? "~/.openclaw/secrets/gmail-credentials.json";
const tokenPath =
  process.env.GOOGLE_OAUTH_TOKEN ?? "~/.openclaw/secrets/gmail-token.json";

const haveCredentials = existsSync(expandHome(credentialsPath));
const haveToken = existsSync(expandHome(tokenPath));

const describeIfCreds = runLive && haveCredentials ? describe : describe.skip;
const describeIfToken = runLive && haveToken ? describe : describe.skip;

describeIfCreds("live: OAuth URL generation (requires credentials only)", () => {
  it("buildAuthUrl returns a Google consent URL with offline access + all scopes", async () => {
    const url = await buildAuthUrl({ credentialsPath, tokenPath });
    expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\//);
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toMatch(/scope=[^&]*gmail/);
    expect(url).toMatch(/scope=[^&]*calendar/);
    expect(url).toMatch(/scope=[^&]*drive/);
    expect(url).toMatch(/scope=[^&]*documents/);
    expect(url).toMatch(/scope=[^&]*spreadsheets/);
    expect(url).toMatch(/scope=[^&]*presentations/);
  });
});

describeIfToken("live: round-trip against Google APIs (requires token)", () => {
  it("gmail.users.getProfile returns the authorized email address", async () => {
    const auth = await createOAuthClient({ credentialsPath, tokenPath });
    const gmail = google.gmail({ version: "v1", auth });
    const res = await gmail.users.getProfile({ userId: "me" });
    expect(res.data.emailAddress).toMatch(/@/);
  }, 15000);

  it("calendar.calendarList.list returns at least the primary calendar", async () => {
    const auth = await createOAuthClient({ credentialsPath, tokenPath });
    const calendar = google.calendar({ version: "v3", auth });
    const res = await calendar.calendarList.list();
    expect(res.data.items?.length ?? 0).toBeGreaterThan(0);
  }, 15000);

  it("drive.about.get returns user info (proves drive scope works)", async () => {
    const auth = await createOAuthClient({ credentialsPath, tokenPath });
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.about.get({ fields: "user(emailAddress)" });
    expect(res.data.user?.emailAddress).toMatch(/@/);
  }, 15000);

  it("sheets create + delete proves write access", async () => {
    const auth = await createOAuthClient({ credentialsPath, tokenPath });
    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title: `live-test-${Date.now()}` } },
    });
    expect(created.data.spreadsheetId).toBeTruthy();
    await drive.files.delete({ fileId: created.data.spreadsheetId! });
  }, 20000);

  it("docs create + delete proves docs scope", async () => {
    const auth = await createOAuthClient({ credentialsPath, tokenPath });
    const docs = google.docs({ version: "v1", auth });
    const drive = google.drive({ version: "v3", auth });
    const created = await docs.documents.create({
      requestBody: { title: `live-test-${Date.now()}` },
    });
    expect(created.data.documentId).toBeTruthy();
    await drive.files.delete({ fileId: created.data.documentId! });
  }, 20000);

  it("slides create + delete proves presentations scope", async () => {
    const auth = await createOAuthClient({ credentialsPath, tokenPath });
    const slides = google.slides({ version: "v1", auth });
    const drive = google.drive({ version: "v3", auth });
    const created = await slides.presentations.create({
      requestBody: { title: `live-test-${Date.now()}` },
    });
    expect(created.data.presentationId).toBeTruthy();
    await drive.files.delete({ fileId: created.data.presentationId! });
  }, 20000);
});
