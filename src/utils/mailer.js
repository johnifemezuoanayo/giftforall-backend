const nodemailer = require("nodemailer");

// Resend takes up to 100 emails in one request.
const RESEND_BATCH_SIZE = 100;
const RESEND_URL = process.env.RESEND_API_URL || "https://api.resend.com";

let smtpTransporter = null;

// Uses Resend when its key is set, otherwise SMTP (like Mailpit for testing). EMAIL_PROVIDER can force one.
function emailProvider() {
  const chosen = String(process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (chosen === "resend" || chosen === "smtp") return chosen;
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return null;
}

function isEmailConfigured() {
  const provider = emailProvider();
  if (!process.env.EMAIL_FROM) return false;
  if (provider === "resend") return Boolean(process.env.RESEND_API_KEY);
  if (provider === "smtp") return Boolean(process.env.SMTP_HOST);
  return false;
}

class EmailError extends Error {
  constructor(message, { status = 0, name = "", retryAfter = 0, stopSending = false } = {}) {
    super(message);
    this.status = status;
    this.code = name;
    this.retryAfter = retryAfter;
    // True when trying again won't help, like a used-up quota or a wrong API key.
    this.stopSending = stopSending;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toResendEmail(message) {
  return {
    from: process.env.EMAIL_FROM,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.headers && Object.keys(message.headers).length ? message.headers : undefined,
    reply_to: message.replyTo || undefined,
    tags: message.tags,
  };
}

async function resendRequest(path, body, idempotencyKey) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`${RESEND_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // Resend turns away requests without a User-Agent.
        "User-Agent": "gift-site-newsletter/1.0",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;

    const name = data.name || data.error?.name || "";
    const message = data.message || data.error?.message || `Resend answered with status ${response.status}`;
    const retryAfter = Number(response.headers.get("retry-after")) || 1;
    const quotaUsed = name === "daily_quota_exceeded" || name === "monthly_quota_exceeded";

    // Too many requests at once: wait as long as Resend asks, then try again.
    if (response.status === 429 && !quotaUsed && attempt < 4) {
      await sleep(retryAfter * 1000);
      continue;
    }
    // Resend is still working on the same request, so wait a moment and ask again.
    if (response.status === 409 && name === "concurrent_idempotent_requests" && attempt < 4) {
      await sleep(1000);
      continue;
    }

    throw new EmailError(message, {
      status: response.status,
      name,
      retryAfter,
      stopSending: quotaUsed || response.status === 401 || response.status === 403,
    });
  }
  throw new EmailError("Resend kept saying it was busy. Please try again later.", { status: 429 });
}

function getSmtpTransporter() {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      pool: true,
      maxConnections: 3,
    });
  }
  return smtpTransporter;
}

// message: { to, subject, html, text, headers, replyTo, tags }
async function sendEmail(message, idempotencyKey) {
  if (emailProvider() === "resend") {
    return resendRequest("/emails", toResendEmail(message), idempotencyKey);
  }
  return getSmtpTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.headers,
    replyTo: message.replyTo,
  });
}

// Sends up to 100 emails in one Resend request. If one address is bad, Resend refuses the whole batch.
async function sendResendBatch(messages, idempotencyKey) {
  return resendRequest("/emails/batch", messages.map(toResendEmail), idempotencyKey);
}

function emailSettings() {
  const provider = emailProvider();
  const isLocalSmtp = provider === "smtp" && ["127.0.0.1", "localhost"].includes(process.env.SMTP_HOST);
  return {
    configured: isEmailConfigured(),
    provider,
    providerName: provider === "resend" ? "Resend" : provider === "smtp" ? (isLocalSmtp ? "Mailpit (test inbox)" : "SMTP") : "",
    missingResendKey: provider === "resend" && !process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || "",
    // Mailpit catches emails on this computer instead of delivering them.
    testInbox: isLocalSmtp ? process.env.MAILPIT_URL || "http://localhost:8025" : "",
  };
}

module.exports = { EmailError, RESEND_BATCH_SIZE, emailProvider, emailSettings, isEmailConfigured, sendEmail, sendResendBatch };
