import { google } from "googleapis";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { OAuth2Client } from "google-auth-library";

export interface AuthConfig {
  credentialsPath: string;
  tokenPath: string;
}

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
];

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return p;
}

interface InstalledCredentials {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

async function readCredentials(credentialsPath: string) {
  const raw = await readFile(expandHome(credentialsPath), "utf8");
  const parsed = JSON.parse(raw) as InstalledCredentials;
  const creds = parsed.installed ?? parsed.web;
  if (!creds) {
    throw new Error(
      `Credentials file at ${credentialsPath} is missing "installed" or "web" block`
    );
  }
  return creds;
}

export async function createOAuthClient(
  config: AuthConfig
): Promise<OAuth2Client> {
  const creds = await readCredentials(config.credentialsPath);
  const client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0]
  );

  try {
    const tokenRaw = await readFile(expandHome(config.tokenPath), "utf8");
    client.setCredentials(JSON.parse(tokenRaw));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  return client;
}

export async function buildAuthUrl(config: AuthConfig): Promise<string> {
  const client = await createOAuthClient(config);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCode(
  config: AuthConfig,
  code: string
): Promise<{ tokenPath: string; scopes: string[] }> {
  const client = await createOAuthClient(config);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Revoke prior consent at " +
        "https://myaccount.google.com/permissions then retry with prompt=consent."
    );
  }
  const tokenPath = expandHome(config.tokenPath);
  await writeFile(tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return {
    tokenPath,
    scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = 30000
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
