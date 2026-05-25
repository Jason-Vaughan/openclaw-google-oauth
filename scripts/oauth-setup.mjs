#!/usr/bin/env node
// Standalone OAuth setup for @tangleclaw/openclaw-google-oauth.
//
// Run from anywhere the plugin's dist/ is built and node_modules are installed.
//   node scripts/oauth-setup.mjs
//
// Optional flags:
//   --credentials <path>   default ~/.openclaw/secrets/gmail-credentials.json
//   --token <path>         default ~/.openclaw/secrets/gmail-token.json

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { buildAuthUrl, exchangeCode } from "../dist/auth.js";

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i]?.startsWith("--")) flags[argv[i].slice(2)] = argv[i + 1];
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const config = {
    credentialsPath:
      flags.credentials ?? "~/.openclaw/secrets/gmail-credentials.json",
    tokenPath: flags.token ?? "~/.openclaw/secrets/gmail-token.json",
  };

  console.log("Reading credentials from:", config.credentialsPath);
  console.log("Will write token to:    ", config.tokenPath);
  console.log();

  const url = await buildAuthUrl(config);
  console.log("1. Open this URL in a browser:");
  console.log();
  console.log("   " + url);
  console.log();
  console.log("2. Sign in with the target Google account.");
  console.log("3. Click through any 'Google hasn't verified this app' warning.");
  console.log("4. Grant access to all requested scopes.");
  console.log("5. You'll be redirected to a localhost URL that may show an error — that's fine.");
  console.log("6. From the URL bar, copy the value of the `code=` query parameter (everything between `code=` and the next `&`, URL-decoded).");
  console.log();

  const rl = createInterface({ input: stdin, output: stdout });
  const code = (await rl.question("Paste the code here: ")).trim();
  rl.close();

  if (!code) {
    console.error("ERROR: no code provided.");
    process.exit(1);
  }

  console.log();
  console.log("Exchanging code for tokens...");
  const result = await exchangeCode(config, code);
  console.log();
  console.log("Success.");
  console.log("Token written to:", result.tokenPath);
  console.log("Granted scopes:");
  for (const scope of result.scopes) console.log("  -", scope);
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err);
  process.exit(1);
});
