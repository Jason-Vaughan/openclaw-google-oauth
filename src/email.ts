export interface Rfc2822Args {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

export function encodeRfc2822(args: Rfc2822Args): string {
  const headers = [
    `To: ${args.to}`,
    args.cc ? `Cc: ${args.cc}` : undefined,
    args.bcc ? `Bcc: ${args.bcc}` : undefined,
    args.replyTo ? `Reply-To: ${args.replyTo}` : undefined,
    `Subject: ${args.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ].filter(Boolean) as string[];
  const message = `${headers.join("\r\n")}\r\n\r\n${args.body}`;
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeRfc2822(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}
