import "server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * [DEV ADAPTER] Logs the email and writes it to .dev-mail/ (gitignored) so
 * flows can be inspected without an email provider.
 */
class DevEmailSender implements EmailSender {
  async send(message: EmailMessage) {
    console.info(`[DEV ADAPTER] email to ${message.to}: ${message.subject}`);
    try {
      const dir = join(process.cwd(), ".dev-mail");
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      writeFileSync(
        join(
          dir,
          `${stamp}-${message.subject.slice(0, 40).replace(/[^a-z0-9]+/gi, "-")}.html`,
        ),
        message.html,
      );
    } catch {
      // Best effort — console log above is the record.
    }
  }
}

/** Resend implementation, active when RESEND_API_KEY is set. */
class ResendEmailSender implements EmailSender {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
    }
  }
}

let sender: EmailSender | undefined;

export function getEmailSender(): EmailSender {
  if (!sender) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      sender = new ResendEmailSender(
        apiKey,
        process.env.EMAIL_FROM ?? "no-reply@thrivemap.local",
      );
    } else {
      sender = new DevEmailSender();
    }
  }
  return sender;
}
