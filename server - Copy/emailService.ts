// Sends transactional email via Brevo's REST API (https://api.brevo.com).
// Requires BREVO_API_KEY and BREVO_SENDER_EMAIL environment variables.
// BREVO_SENDER_EMAIL must be a verified sender in your Brevo account.

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    throw new Error("Email service not configured (missing BREVO_API_KEY or BREVO_SENDER_EMAIL)");
  }

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: "Mafia Verse", email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${errBody}`);
  }
}

export function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function build2FAEmailHtml(code: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a2e;">Mafia Verse Verification Code</h2>
      <p>Your verification code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${code}</p>
      <p style="color: #666; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}
