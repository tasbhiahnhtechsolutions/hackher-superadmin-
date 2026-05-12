// Reusable email templates — Stripe-inspired premium SaaS look.
// Each template returns { subject, html, text }.

const BRAND = {
  name: "HackHer.ai",
  primary: "#7c3aed",
  primaryDark: "#5b21b6",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  success: "#16a34a",
  danger: "#dc2626",
};

function layout(opts: {
  preheader?: string;
  heading: string;
  body: string;
  cta?: { label: string; href: string };
  footerNote?: string;
}) {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td style="border-radius:8px;background:${BRAND.primary};">
          <a href="${opts.cta.href}" style="display:inline-block;padding:12px 24px;color:#fff;font-weight:600;font-size:14px;text-decoration:none;border-radius:8px;font-family:Inter,Arial,sans-serif;">${opts.cta.label}</a>
        </td></tr>
      </table>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.heading}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif;color:${BRAND.text};">
<span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${opts.preheader ?? ""}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${BRAND.card};border-radius:14px;border:1px solid ${BRAND.border};overflow:hidden;">
      <tr><td style="padding:24px 32px;border-bottom:1px solid ${BRAND.border};">
        <div style="display:inline-block;width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});vertical-align:middle;"></div>
        <span style="margin-left:10px;font-weight:700;font-size:16px;vertical-align:middle;">${BRAND.name}</span>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;line-height:1.3;color:${BRAND.text};">${opts.heading}</h1>
        <div style="font-size:14px;line-height:1.6;color:${BRAND.text};">${opts.body}</div>
        ${cta}
        ${opts.footerNote ? `<p style="margin:24px 0 0;font-size:12px;color:${BRAND.muted};line-height:1.5;">${opts.footerNote}</p>` : ""}
      </td></tr>
      <tr><td style="padding:20px 32px;background:${BRAND.bg};border-top:1px solid ${BRAND.border};font-size:12px;color:${BRAND.muted};text-align:center;">
        © ${new Date().getFullYear()} ${BRAND.name}. You can manage notifications in your account settings.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function fmtMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format((cents ?? 0) / 100);
}

function summaryRow(label: string, value: string) {
  return `<tr><td style="padding:8px 0;color:${BRAND.muted};font-size:13px;">${label}</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:13px;">${value}</td></tr>`;
}

function summaryTable(rows: Array<[string, string]>) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid ${BRAND.border};border-radius:10px;padding:8px 16px;">${rows.map(([k, v]) => summaryRow(k, v)).join("")}</table>`;
}

export type EmailContent = { subject: string; html: string; text: string };

export const TEMPLATES = {
  welcome: (d: { name?: string; appUrl: string }): EmailContent => {
    const subject = `Welcome to ${BRAND.name}`;
    const body = `<p>Hi ${d.name || "there"},</p><p>Welcome aboard. Your account is ready — start exploring your dashboard, generate a promo code, and watch your earnings grow in real time.</p>`;
    const html = layout({ heading: subject, body, cta: { label: "Open dashboard", href: d.appUrl }, preheader: "Your account is ready." });
    return { subject, html, text: stripHtml(body) };
  },

  password_reset: (d: { resetUrl: string }): EmailContent => {
    const subject = `Reset your ${BRAND.name} password`;
    const body = `<p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>`;
    const html = layout({ heading: subject, body, cta: { label: "Reset password", href: d.resetUrl }, footerNote: "If you didn't request this, you can safely ignore this email." });
    return { subject, html, text: stripHtml(body) };
  },

  email_verification: (d: { verifyUrl: string }): EmailContent => {
    const subject = `Verify your email`;
    const body = `<p>Confirm your email address to activate your account.</p>`;
    const html = layout({ heading: subject, body, cta: { label: "Verify email", href: d.verifyUrl } });
    return { subject, html, text: stripHtml(body) };
  },

  login_alert: (d: { ip?: string; ua?: string; when: string }): EmailContent => {
    const subject = `New sign-in to your account`;
    const body = `<p>We detected a new sign-in to your ${BRAND.name} account.</p>` +
      summaryTable([["When", d.when], ["IP address", d.ip || "unknown"], ["Device", d.ua || "unknown"]]);
    const html = layout({ heading: subject, body, footerNote: "If this wasn't you, please reset your password immediately." });
    return { subject, html, text: stripHtml(body) };
  },

  subscription_created: (d: { planName: string; amountCents: number; currency: string; appUrl: string }): EmailContent => {
    const subject = `Subscription confirmed — ${d.planName}`;
    const body = `<p>Thanks for subscribing! Here's a summary of your subscription.</p>` +
      summaryTable([["Plan", d.planName], ["Amount", fmtMoney(d.amountCents, d.currency)], ["Status", "Active"]]);
    const html = layout({ heading: subject, body, cta: { label: "View account", href: d.appUrl } });
    return { subject, html, text: stripHtml(body) };
  },

  payment_success: (d: { amountCents: number; currency: string; planName?: string; invoiceUrl?: string }): EmailContent => {
    const subject = `Payment received — ${fmtMoney(d.amountCents, d.currency)}`;
    const body = `<p>We've received your payment. Thanks!</p>` +
      summaryTable([["Plan", d.planName || "Subscription"], ["Amount", fmtMoney(d.amountCents, d.currency)], ["Date", new Date().toLocaleDateString()]]);
    const html = layout({ heading: subject, body, ...(d.invoiceUrl ? { cta: { label: "View invoice", href: d.invoiceUrl } } : {}) });
    return { subject, html, text: stripHtml(body) };
  },

  payment_failed: (d: { amountCents: number; currency: string; updateUrl: string }): EmailContent => {
    const subject = `Payment failed`;
    const body = `<p>We couldn't process your latest payment of ${fmtMoney(d.amountCents, d.currency)}. Please update your payment method to avoid service interruption.</p>`;
    const html = layout({ heading: subject, body, cta: { label: "Update payment method", href: d.updateUrl } });
    return { subject, html, text: stripHtml(body) };
  },

  subscription_canceled: (d: { planName: string; endsAt?: string }): EmailContent => {
    const subject = `Subscription canceled`;
    const body = `<p>Your <b>${d.planName}</b> subscription has been canceled.${d.endsAt ? ` You'll retain access until <b>${d.endsAt}</b>.` : ""}</p>`;
    return { subject, html: layout({ heading: subject, body }), text: stripHtml(body) };
  },

  subscription_renewed: (d: { planName: string; amountCents: number; currency: string }): EmailContent => {
    const subject = `Your subscription was renewed`;
    const body = `<p>Your <b>${d.planName}</b> subscription was renewed for ${fmtMoney(d.amountCents, d.currency)}.</p>`;
    return { subject, html: layout({ heading: subject, body }), text: stripHtml(body) };
  },

  trial_ending: (d: { planName: string; endsAt: string; updateUrl: string }): EmailContent => {
    const subject = `Your trial ends ${d.endsAt}`;
    const body = `<p>Your free trial of <b>${d.planName}</b> ends on <b>${d.endsAt}</b>. Add a payment method to continue without interruption.</p>`;
    const html = layout({ heading: subject, body, cta: { label: "Add payment method", href: d.updateUrl } });
    return { subject, html, text: stripHtml(body) };
  },

  affiliate_welcome: (d: { name?: string; dashboardUrl: string }): EmailContent => {
    const subject = `Welcome to the ${BRAND.name} affiliate program`;
    const body = `<p>Hi ${d.name || "there"},</p><p>Your affiliate account is live. Generate promo codes, share your link, and earn on every paid signup.</p>`;
    const html = layout({ heading: subject, body, cta: { label: "Open affiliate dashboard", href: d.dashboardUrl } });
    return { subject, html, text: stripHtml(body) };
  },

  promo_approved: (d: { code: string; discountPct: number; dashboardUrl: string }): EmailContent => {
    const subject = `Your promo code "${d.code}" is live`;
    const body = `<p>Your promo code is approved and active.</p>` +
      summaryTable([["Code", d.code], ["Discount", `${d.discountPct}%`], ["Status", "Active"]]);
    const html = layout({ heading: subject, body, cta: { label: "View promo codes", href: d.dashboardUrl } });
    return { subject, html, text: stripHtml(body) };
  },

  commission_cleared: (d: { amountCents: number; currency: string; dashboardUrl: string }): EmailContent => {
    const subject = `Commission cleared — ${fmtMoney(d.amountCents, d.currency)}`;
    const body = `<p>Good news! A commission has cleared and is now eligible for payout.</p>` +
      summaryTable([["Amount", fmtMoney(d.amountCents, d.currency)], ["Status", "Cleared"]]);
    const html = layout({ heading: subject, body, cta: { label: "View earnings", href: d.dashboardUrl } });
    return { subject, html, text: stripHtml(body) };
  },

  payout_sent: (d: { amountCents: number; currency: string; periodStart?: string; periodEnd?: string }): EmailContent => {
    const subject = `Payout sent — ${fmtMoney(d.amountCents, d.currency)}`;
    const body = `<p>Your payout has been processed. Funds should arrive in your account shortly.</p>` +
      summaryTable([
        ["Amount", fmtMoney(d.amountCents, d.currency)],
        ["Period", `${d.periodStart || "—"} → ${d.periodEnd || "—"}`],
        ["Status", "Sent"],
      ]);
    return { subject, html: layout({ heading: subject, body }), text: stripHtml(body) };
  },

  payout_failed: (d: { amountCents: number; currency: string; reason?: string }): EmailContent => {
    const subject = `Payout failed — action required`;
    const body = `<p>We were unable to process your payout of ${fmtMoney(d.amountCents, d.currency)}.${d.reason ? ` Reason: <b>${d.reason}</b>.` : ""} Please review your payout details.</p>`;
    return { subject, html: layout({ heading: subject, body }), text: stripHtml(body) };
  },

  admin_alert: (d: { title: string; message: string; severity?: "info" | "warning" | "critical" }): EmailContent => {
    const subject = `[${(d.severity || "info").toUpperCase()}] ${d.title}`;
    const body = `<p>${d.message}</p>`;
    return { subject, html: layout({ heading: d.title, body, footerNote: "Admin alert from your platform monitor." }), text: stripHtml(body) };
  },
} as const;

export type TemplateName = keyof typeof TEMPLATES;
