import { describe, it, expect } from "vitest";
import { encodeRfc2822, decodeRfc2822 } from "./email.js";

describe("encodeRfc2822", () => {
  it("produces a base64url-encoded string (no +, /, or = chars)", () => {
    const encoded = encodeRfc2822({
      to: "alice@example.com",
      subject: "Hello",
      body: "Test body",
    });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips back to a parseable RFC 2822 message", () => {
    const args = {
      to: "alice@example.com",
      subject: "Status update",
      body: "All systems nominal.",
    };
    const decoded = decodeRfc2822(encodeRfc2822(args));
    expect(decoded).toContain("To: alice@example.com");
    expect(decoded).toContain("Subject: Status update");
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded.endsWith("All systems nominal.")).toBe(true);
  });

  it("omits Cc/Bcc/Reply-To headers when not provided", () => {
    const decoded = decodeRfc2822(
      encodeRfc2822({ to: "a@b.com", subject: "S", body: "B" })
    );
    expect(decoded).not.toContain("Cc:");
    expect(decoded).not.toContain("Bcc:");
    expect(decoded).not.toContain("Reply-To:");
  });

  it("includes optional headers when provided", () => {
    const decoded = decodeRfc2822(
      encodeRfc2822({
        to: "a@b.com",
        cc: "c@d.com",
        bcc: "e@f.com",
        replyTo: "g@h.com",
        subject: "S",
        body: "B",
      })
    );
    expect(decoded).toContain("Cc: c@d.com");
    expect(decoded).toContain("Bcc: e@f.com");
    expect(decoded).toContain("Reply-To: g@h.com");
  });

  it("preserves UTF-8 in body and subject", () => {
    const decoded = decodeRfc2822(
      encodeRfc2822({
        to: "alice@example.com",
        subject: "Café ☕",
        body: "Résumé — naïve fiancé",
      })
    );
    expect(decoded).toContain("Café ☕");
    expect(decoded).toContain("Résumé — naïve fiancé");
  });

  it("separates headers from body with CRLF CRLF", () => {
    const encoded = encodeRfc2822({
      to: "a@b.com",
      subject: "S",
      body: "B",
    });
    const decoded = decodeRfc2822(encoded);
    expect(decoded).toMatch(/\r\n\r\n/);
  });
});
