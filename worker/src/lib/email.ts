/**
 * Email sender — Resend HTTP API.
 *
 * If `RESEND_API_KEY` isn't set, falls back to logging to Workers logs so dev
 * keeps working without external deps. In production set the key as a secret:
 *   `wrangler secret put RESEND_API_KEY`
 *
 * Never log recipient addresses, passwords or links — status codes and event
 * names only.
 */

type EmailEnv = {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
};

export type SendResult = { delivered: boolean; via: "resend" | "log" };

const DEFAULT_FROM = "Veya <noreply@mail.offgridlabs.org>";

/** Where the emails point people. The Worker's custom domain. */
const SITE_URL = "https://eugene-lms.workplacefiles.com";

// Brand tokens, duplicated here because email clients get inline styles only.
const INDIGO = "#5769e7";
const CREAM = "#f3ede7";
const INK = "#1c1a19";

/**
 * RFC 2606 / RFC 6761 reserved names. The Playwright suite applies with
 * `@example.com` addresses against production; sending to them would bounce
 * every run and burn the sending domain's reputation for nothing.
 */
const UNDELIVERABLE = /@(?:[^@]*\.)?(?:example\.(?:com|net|org)|test|invalid|localhost)$/i;

async function send(
  env: EmailEnv,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    // Redacted log only — never echo the recipient address or the password.
    console.log(JSON.stringify({ event: "email_skipped", reason: "no_api_key" }));
    return { delivered: false, via: "log" };
  }
  if (UNDELIVERABLE.test(to)) {
    console.log(JSON.stringify({ event: "email_skipped", reason: "reserved_domain" }));
    return { delivered: false, via: "log" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM ?? DEFAULT_FROM,
      to,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    // Don't echo Resend's response body — it can contain the recipient address
    // or other identifying fields. Status code is enough to debug.
    console.error(JSON.stringify({ event: "resend_send_failed", status: res.status }));
    return { delivered: false, via: "resend" };
  }
  console.log(JSON.stringify({ event: "resend_send_ok", status: res.status }));
  return { delivered: true, via: "resend" };
}

/** Sent the moment a visitor submits the public /apply form. */
export async function sendApplicationReceivedEmail(
  env: EmailEnv,
  args: { to: string; fullName: string; program: string },
): Promise<SendResult> {
  return send(
    env,
    args.to,
    "We've got your Veya application",
    renderReceivedHtml(args),
    renderReceivedText(args),
  );
}

/**
 * Sent when an admin accepts an application. `temporaryPassword` is omitted
 * when the applicant already had an account — we don't reset a live password,
 * and the email must not hint at whether one existed.
 */
export async function sendApplicationAcceptedEmail(
  env: EmailEnv,
  args: { to: string; fullName: string; program: string; temporaryPassword?: string },
): Promise<SendResult> {
  return send(
    env,
    args.to,
    `You're in — welcome to Veya`,
    renderAcceptedHtml(args),
    renderAcceptedText(args),
  );
}

/**
 * Sent when someone asks to reset a forgotten password.
 *
 * The token reaches the recipient and nowhere else: it is never logged, and only
 * its SHA-256 is stored. `send()` already refuses to echo addresses or bodies,
 * so nothing here needs to be redacted at the call site.
 */
export async function sendPasswordResetEmail(
  env: EmailEnv,
  args: { to: string; fullName: string; token: string; expiresInMinutes: number },
): Promise<SendResult> {
  return send(
    env,
    args.to,
    "Reset your Veya password",
    renderResetHtml(args),
    renderResetText(args),
  );
}

/** A short, human decline. */
export async function sendApplicationRejectedEmail(
  env: EmailEnv,
  args: { to: string; fullName: string; program: string },
): Promise<SendResult> {
  return send(
    env,
    args.to,
    "About your Veya application",
    renderRejectedHtml(args),
    renderRejectedText(args),
  );
}

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || "there";

/** Minimal HTML escaping — applicant names and programs land in the markup. */
const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const shell = (inner: string) => `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <div style="max-width:560px;margin:40px auto;padding:32px;background:#ffffff;border:1px solid rgba(28,26,25,0.08);border-radius:16px;">
      <a href="${SITE_URL}" style="display:inline-block;text-decoration:none;font-weight:bold;font-size:22px;letter-spacing:0.14em;text-transform:uppercase;color:${INDIGO};">
        Veya
      </a>
      ${inner}
      <hr style="border:none;border-top:1px solid rgba(28,26,25,.08);margin:32px 0 16px;" />
      <p style="font-size:12px;color:rgba(28,26,25,.55);margin:0;">
        Veya Admissions · <a href="${SITE_URL}" style="color:${INDIGO};text-decoration:none;">eugene-lms.workplacefiles.com</a>
      </p>
    </div>
  </body>
</html>`;

const h1 = (copy: string) =>
  `<h1 style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:32px;line-height:1.1;margin:32px 0 12px;">${copy}</h1>`;

const p = (copy: string) =>
  `<p style="font-size:15px;line-height:1.6;color:rgba(28,26,25,.85);margin:0 0 16px;">${copy}</p>`;

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:${INDIGO};color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:9999px;font-size:15px;margin:12px 0 8px;">${label}</a>`;

function renderReceivedText(args: { fullName: string; program: string }): string {
  return [
    "Veya — your application is in",
    "",
    `Hi ${firstName(args.fullName)},`,
    "",
    `Thanks for applying to ${args.program} at Veya. Your application has been received and is now with our admissions team.`,
    "",
    "We review applications in the order they arrive, and you'll hear from us by email either way — there's nothing you need to do in the meantime.",
    "",
    "Veya Admissions",
    SITE_URL,
  ].join("\n");
}

function renderReceivedHtml(args: { fullName: string; program: string }): string {
  return shell(
    h1("Your application is in.") +
      p(`Hi ${esc(firstName(args.fullName))},`) +
      p(
        `Thanks for applying to <strong>${esc(args.program)}</strong> at Veya. Your application has been received and is now with our admissions team.`,
      ) +
      p(
        "We review applications in the order they arrive, and you'll hear from us by email either way. There's nothing you need to do in the meantime.",
      ),
  );
}

function renderAcceptedText(args: {
  fullName: string;
  program: string;
  temporaryPassword?: string;
  to: string;
}): string {
  const lines = [
    "Veya — you're in",
    "",
    `Hi ${firstName(args.fullName)},`,
    "",
    `You've been accepted onto ${args.program} at Veya. Congratulations.`,
    "",
  ];
  if (args.temporaryPassword) {
    lines.push(
      "Your student account is ready. Sign in with:",
      "",
      `  Email:              ${args.to}`,
      `  Temporary password: ${args.temporaryPassword}`,
      "",
      "Change that password once you're in — it was generated for you and this email is the only copy.",
    );
  } else {
    lines.push("Your student account is ready. Sign in with this email address and your usual password.");
  }
  lines.push("", `${SITE_URL}/login`, "", "Veya Admissions");
  return lines.join("\n");
}

function renderAcceptedHtml(args: {
  fullName: string;
  program: string;
  temporaryPassword?: string;
  to: string;
}): string {
  const credentials = args.temporaryPassword
    ? p("Your student account is ready. Sign in with:") +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${CREAM};border-radius:12px;padding:16px;margin:0 0 20px;">
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:rgba(28,26,25,.55);width:120px;">Email</td>
          <td style="padding:12px 16px;font-size:15px;font-family:'Courier New',monospace;color:${INK};">${esc(args.to)}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:rgba(28,26,25,.55);">Password</td>
          <td style="padding:12px 16px;font-size:15px;font-family:'Courier New',monospace;font-weight:bold;color:${INK};">${esc(args.temporaryPassword)}</td>
        </tr>
      </table>` +
      p(
        "Change that password once you're in — it was generated for you, and this email is the only copy.",
      )
    : p(
        "Your student account is ready. Sign in with this email address and your usual password.",
      );

  return shell(
    h1("You're in.") +
      p(`Hi ${esc(firstName(args.fullName))},`) +
      p(
        `You've been accepted onto <strong>${esc(args.program)}</strong> at Veya. Congratulations.`,
      ) +
      credentials +
      button(`${SITE_URL}/login`, "Sign in to Veya") +
      p(
        `<span style="font-size:13px;color:rgba(28,26,25,.55);">Button not working? Go to <a href="${SITE_URL}/login" style="color:${INDIGO};font-weight:bold;">${SITE_URL}/login</a></span>`,
      ),
  );
}

const resetLink = (token: string) =>
  `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;

function renderResetText(args: {
  fullName: string;
  token: string;
  expiresInMinutes: number;
}): string {
  return [
    "Veya — reset your password",
    "",
    `Hi ${firstName(args.fullName)},`,
    "",
    "Someone asked to reset the password on your Veya account. Open this link to choose a new one:",
    "",
    `  ${resetLink(args.token)}`,
    "",
    `The link works once and expires in ${args.expiresInMinutes} minutes.`,
    "",
    "If this wasn't you, ignore this email — your password stays as it is.",
    "",
    "Veya",
    SITE_URL,
  ].join("\n");
}

function renderResetHtml(args: {
  fullName: string;
  token: string;
  expiresInMinutes: number;
}): string {
  const href = resetLink(args.token);
  return shell(
    h1("Reset your password.") +
      p(`Hi ${esc(firstName(args.fullName))},`) +
      p(
        "Someone asked to reset the password on your Veya account. Choose a new one here:",
      ) +
      button(href, "Choose a new password") +
      p(
        `<span style="font-size:13px;color:rgba(28,26,25,.55);">The link works once and expires in ${args.expiresInMinutes} minutes. Button not working? Copy this into your browser:<br /><span style="word-break:break-all;color:${INDIGO};">${esc(href)}</span></span>`,
      ) +
      p(
        "If this wasn't you, you can ignore this email — your password stays exactly as it is.",
      ),
  );
}

function renderRejectedText(args: { fullName: string; program: string }): string {
  return [
    "Veya — about your application",
    "",
    `Hi ${firstName(args.fullName)},`,
    "",
    `Thank you for applying to ${args.program}. After reviewing your application, we're not able to offer you a place this time.`,
    "",
    "This was a genuinely competitive round, and the decision says far more about the number of places than about your potential. You're welcome to apply again in a future intake.",
    "",
    "We wish you the very best.",
    "",
    "Veya Admissions",
    SITE_URL,
  ].join("\n");
}

function renderRejectedHtml(args: { fullName: string; program: string }): string {
  return shell(
    h1("About your application.") +
      p(`Hi ${esc(firstName(args.fullName))},`) +
      p(
        `Thank you for applying to <strong>${esc(args.program)}</strong>. After reviewing your application, we're not able to offer you a place this time.`,
      ) +
      p(
        "This was a genuinely competitive round, and the decision says far more about the number of places than about your potential. You're welcome to apply again in a future intake.",
      ) +
      p("We wish you the very best."),
  );
}
