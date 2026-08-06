import { siteConfig } from "@/lib/site-config";

/**
 * The 15 transactional email templates, as plain HTML with inline styles
 * (email clients ignore stylesheets). Each returns subject + html + text;
 * the caller supplies the recipient.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#faf6ef;font-family:Georgia,'Times New Roman',serif;color:#1f2a2e;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:22px;font-weight:bold;color:#0f4c5c;margin:0 0 24px;">${siteConfig.name}</p>
    <div style="background:#ffffff;border-radius:12px;padding:28px;border:1px solid #eadfce;">
      <h1 style="font-size:20px;color:#0f4c5c;margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="font-size:12px;color:#6b7672;margin:24px 0 0;">
      ${siteConfig.name} — autism-focused clinic directory for the Philippines.<br/>
      Questions? Reply to this email or write to ${siteConfig.contactEmail}.
    </p>
  </div>
</body>
</html>`;
}

function paragraphs(...lines: string[]): string {
  return lines
    .map(
      (l) =>
        `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${l}</p>`,
    )
    .join("\n");
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0 6px;"><a href="${href}" style="display:inline-block;background:#0f4c5c;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:15px;">${label}</a></p>`;
}

const url = (path: string) => `${siteConfig.url}${path}`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const emailTemplates = {
  welcome(params: { name: string }): EmailContent {
    const title = `Welcome to ${siteConfig.name}`;
    return {
      subject: title,
      html: layout(
        title,
        paragraphs(
          `Hi ${params.name},`,
          `Thanks for joining. You can now save favorite clinics, suggest new ones, and track your submissions.`,
        ) + button(url("/clinics"), "Browse clinics"),
      ),
      text: `Hi ${params.name},\n\nThanks for joining ${siteConfig.name}. Save favorites, suggest clinics, and track submissions at ${url("/account")}.`,
    };
  },

  submissionReceived(params: {
    name: string;
    clinicName: string;
  }): EmailContent {
    return {
      subject: `We received your suggestion: ${params.clinicName}`,
      html: layout(
        "Suggestion received",
        paragraphs(
          `Hi ${params.name},`,
          `Thanks for suggesting <strong>${params.clinicName}</strong>. Our moderators will review it — most reviews finish within a few days.`,
          `You can follow its status from your account.`,
        ) + button(url("/account/submissions"), "View my submissions"),
      ),
      text: `Hi ${params.name},\n\nThanks for suggesting ${params.clinicName}. Moderators will review it soon. Track status: ${url("/account/submissions")}`,
    };
  },

  submissionApproved(params: {
    name: string;
    clinicName: string;
    clinicSlug: string;
  }): EmailContent {
    return {
      subject: `${params.clinicName} is now listed on ${siteConfig.name}`,
      html: layout(
        "Suggestion approved",
        paragraphs(
          `Hi ${params.name},`,
          `Great news — <strong>${params.clinicName}</strong> has been approved and is now publicly listed. Thank you for helping other families find support.`,
        ) + button(url(`/clinics/${params.clinicSlug}`), "See the listing"),
      ),
      text: `Hi ${params.name},\n\n${params.clinicName} was approved and is now listed: ${url(`/clinics/${params.clinicSlug}`)}`,
    };
  },

  submissionRejected(params: {
    name: string;
    clinicName: string;
    reason: string;
  }): EmailContent {
    return {
      subject: `Update on your suggestion: ${params.clinicName}`,
      html: layout(
        "Suggestion not approved",
        paragraphs(
          `Hi ${params.name},`,
          `We couldn't approve <strong>${params.clinicName}</strong> this time.`,
          `Moderator note: ${params.reason}`,
          `If you have more details (an address, a website, a phone number), you're welcome to suggest it again.`,
        ),
      ),
      text: `Hi ${params.name},\n\nWe couldn't approve ${params.clinicName}. Note: ${params.reason}\nYou can suggest it again with more details.`,
    };
  },

  claimReceived(params: { name: string; clinicName: string }): EmailContent {
    return {
      subject: `Claim received for ${params.clinicName}`,
      html: layout(
        "Claim received",
        paragraphs(
          `Hi ${params.name},`,
          `We received your claim for <strong>${params.clinicName}</strong>. Our team verifies every claim manually, which usually takes a few business days.`,
        ) + button(url("/account"), "View claim status"),
      ),
      text: `Hi ${params.name},\n\nWe received your claim for ${params.clinicName}. Verification usually takes a few business days.`,
    };
  },

  claimApproved(params: { name: string; clinicName: string }): EmailContent {
    return {
      subject: `You now manage ${params.clinicName} on ${siteConfig.name}`,
      html: layout(
        "Claim approved",
        paragraphs(
          `Hi ${params.name},`,
          `Your claim for <strong>${params.clinicName}</strong> has been verified. You can now manage its profile, services, hours, and photos from the clinic portal.`,
        ) + button(url("/clinic-portal"), "Open clinic portal"),
      ),
      text: `Hi ${params.name},\n\nYour claim for ${params.clinicName} was approved. Manage it at ${url("/clinic-portal")}`,
    };
  },

  claimRejected(params: {
    name: string;
    clinicName: string;
    reason: string;
  }): EmailContent {
    return {
      subject: `Update on your claim for ${params.clinicName}`,
      html: layout(
        "Claim not approved",
        paragraphs(
          `Hi ${params.name},`,
          `We couldn't verify your claim for <strong>${params.clinicName}</strong>.`,
          `Reviewer note: ${params.reason}`,
          `If you believe this is a mistake, reply to this email with supporting documents.`,
        ),
      ),
      text: `Hi ${params.name},\n\nWe couldn't verify your claim for ${params.clinicName}. Note: ${params.reason}`,
    };
  },

  claimMoreInfo(params: {
    name: string;
    clinicName: string;
    request: string;
  }): EmailContent {
    return {
      subject: `More information needed for your ${params.clinicName} claim`,
      html: layout(
        "More information needed",
        paragraphs(
          `Hi ${params.name},`,
          `To finish verifying your claim for <strong>${params.clinicName}</strong>, we need a bit more from you:`,
          `<em>${params.request}</em>`,
          `You can upload additional documents from your claim page.`,
        ) + button(url("/account"), "Update my claim"),
      ),
      text: `Hi ${params.name},\n\nWe need more information for your ${params.clinicName} claim: ${params.request}\nUpdate it at ${url("/account")}`,
    };
  },

  changeRequestApproved(params: {
    name: string;
    clinicName: string;
  }): EmailContent {
    return {
      subject: `Your correction to ${params.clinicName} is live`,
      html: layout(
        "Correction applied",
        paragraphs(
          `Hi ${params.name},`,
          `Your suggested correction to <strong>${params.clinicName}</strong> was approved and is now live. Thanks for keeping listings accurate.`,
        ),
      ),
      text: `Hi ${params.name},\n\nYour correction to ${params.clinicName} was approved and is now live.`,
    };
  },

  changeRequestRejected(params: {
    name: string;
    clinicName: string;
    reason: string;
  }): EmailContent {
    return {
      subject: `Update on your correction to ${params.clinicName}`,
      html: layout(
        "Correction not applied",
        paragraphs(
          `Hi ${params.name},`,
          `We didn't apply your suggested correction to <strong>${params.clinicName}</strong>.`,
          `Moderator note: ${params.reason}`,
        ),
      ),
      text: `Hi ${params.name},\n\nYour correction to ${params.clinicName} wasn't applied. Note: ${params.reason}`,
    };
  },

  reportAcknowledged(params: {
    name: string;
    clinicName: string;
  }): EmailContent {
    return {
      subject: `We received your report about ${params.clinicName}`,
      html: layout(
        "Report received",
        paragraphs(
          `Hi ${params.name},`,
          `Thank you for reporting an issue with <strong>${params.clinicName}</strong>. Our moderators review every report; we'll act on it if the listing needs changes.`,
          `For privacy reasons we can't always share the outcome, but every report is read.`,
        ),
      ),
      text: `Hi ${params.name},\n\nThanks for your report about ${params.clinicName}. Moderators review every report.`,
    };
  },

  verificationReminder(params: {
    name: string;
    clinicName: string;
  }): EmailContent {
    return {
      subject: `Time to re-verify ${params.clinicName}`,
      html: layout(
        "Verification reminder",
        paragraphs(
          `Hi ${params.name},`,
          `It's been a while since <strong>${params.clinicName}</strong> was verified. Please confirm the profile — hours, services, contact details — is still accurate so families can rely on it.`,
        ) + button(url("/clinic-portal"), "Review my clinic"),
      ),
      text: `Hi ${params.name},\n\nPlease re-verify ${params.clinicName} — confirm hours, services, and contact details at ${url("/clinic-portal")}`,
    };
  },

  inquiryReceived(params: {
    name: string;
    clinicName: string;
    subject: string;
    path: string;
  }): EmailContent {
    return {
      subject: `New inquiry for ${params.clinicName}`,
      html: layout(
        "New inquiry",
        paragraphs(
          `Hi ${params.name},`,
          `A caregiver sent <strong>${params.clinicName}</strong> a new inquiry: "${escapeHtml(params.subject)}".`,
          `Reply from the clinic portal — families appreciate a quick answer.`,
        ) + button(url(params.path), "Open the inquiry"),
      ),
      text: `Hi ${params.name},\n\nNew inquiry for ${params.clinicName}: "${params.subject}". Reply at ${url(params.path)}`,
    };
  },

  inquiryReply(params: {
    name: string;
    clinicName: string;
    subject: string;
    excerpt: string;
    path: string;
    /**
     * Who receives the email. A caregiver converses *with* the clinic; a
     * manager receives replies *about* their clinic — the copy differs.
     */
    audience?: "caregiver" | "clinic";
  }): EmailContent {
    const intro =
      params.audience === "clinic"
        ? `A caregiver replied in an inquiry conversation for <strong>${params.clinicName}</strong>:`
        : `There's a new reply in your conversation with <strong>${params.clinicName}</strong>:`;
    const textIntro =
      params.audience === "clinic"
        ? `New reply about "${params.subject}" in an inquiry conversation for ${params.clinicName}:`
        : `New reply about "${params.subject}" from your conversation with ${params.clinicName}:`;
    return {
      subject: `New reply about "${params.subject}"`,
      html: layout(
        "New reply",
        paragraphs(
          `Hi ${params.name},`,
          intro,
          `<em>${escapeHtml(params.excerpt)}</em>`,
        ) + button(url(params.path), "Read and reply"),
      ),
      text: `Hi ${params.name},\n\n${textIntro}\n${params.excerpt}\n\nRead and reply: ${url(params.path)}`,
    };
  },

  inquiryStatusChanged(params: {
    name: string;
    clinicName: string;
    subject: string;
    statusLabel: string;
    confirmedDate?: string;
    path: string;
  }): EmailContent {
    const dateLine = params.confirmedDate
      ? `Confirmed date: <strong>${params.confirmedDate}</strong>.`
      : "";
    return {
      subject: `${params.statusLabel}: your inquiry to ${params.clinicName}`,
      html: layout(
        `Inquiry ${params.statusLabel.toLowerCase()}`,
        paragraphs(
          `Hi ${params.name},`,
          `<strong>${params.clinicName}</strong> updated your inquiry "${escapeHtml(params.subject)}" to <strong>${params.statusLabel}</strong>.`,
          ...(dateLine ? [dateLine] : []),
        ) + button(url(params.path), "View the conversation"),
      ),
      text: `Hi ${params.name},\n\n${params.clinicName} updated "${params.subject}" to ${params.statusLabel}.${params.confirmedDate ? ` Confirmed date: ${params.confirmedDate}.` : ""}\n${url(params.path)}`,
    };
  },
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;
