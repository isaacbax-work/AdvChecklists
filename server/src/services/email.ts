import nodemailer, { type Transporter } from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  attachments?: { filename: string; path: string }[];
}

export interface SendEmailResult {
  ok: boolean;
  detail: string;
}

let transporter: Transporter | null = null;
let usingRealSmtp = false;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    usingRealSmtp = true;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  } else {
    // No SMTP configured: fall back to a JSON transport so the app is usable
    // out of the box. The "email" is logged instead of delivered.
    usingRealSmtp = false;
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.SMTP_FROM ?? "AdvChecklists <no-reply@advchecklists.local>";
  try {
    const info = await getTransporter().sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.body,
      attachments: input.attachments,
    });
    const attachmentNote = input.attachments?.length
      ? ` attachments=[${input.attachments.map((a) => a.filename).join(", ")}]`
      : "";
    if (usingRealSmtp) {
      return { ok: true, detail: `Email sent to ${input.to} (messageId=${info.messageId})${attachmentNote}` };
    }
    console.log(`[dev email] to=${input.to} subject=${JSON.stringify(input.subject)}${attachmentNote}`);
    return {
      ok: true,
      detail: `SMTP not configured; email logged instead of sent. to=${input.to} subject=${input.subject}${attachmentNote}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: `Failed to send email to ${input.to}: ${message}` };
  }
}
