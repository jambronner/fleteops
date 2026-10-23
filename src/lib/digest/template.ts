import { formatRegionalDateTime } from "@/lib/dates";
import type { DigestContent, DigestItem } from "@/lib/digest/content";
import { getDictionary } from "@/lib/i18n/config";

export type DigestEmail = {
  subject: string;
  html: string;
  text: string;
};

// Email-safe hexes mirroring the app tokens: navy ink, AA accent, soft paper.
const INK = "#101d3d";
const MUTED = "#55648c";
const ACCENT = "#0d6ad1";
const PAPER = "#f6f8fc";
const LINE = "#dde4f1";

const SEVERITY_STRIP: Record<string, string> = {
  blocked: "#fb7185",
  needsReview: "#fbbf24",
  pendingDocs: "#fdba74",
  inbound: "#38bdf8",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatCount(pair: { one: string; many: string }, count: number) {
  return count === 1 ? pair.one : pair.many.replace("{count}", String(count));
}

export function buildDigestSubject(content: DigestContent, locale: string) {
  const copy = getDictionary(locale).digestEmail.subject;
  const { routesAwaitingDecision, evidenceToLink, newWhatsappSources } = content.counts;

  if (routesAwaitingDecision > 0) {
    return formatCount(copy.routes, routesAwaitingDecision);
  }

  if (evidenceToLink > 0) {
    return formatCount(copy.evidence, evidenceToLink);
  }

  if (newWhatsappSources > 0) {
    return formatCount(copy.sources, newWhatsappSources);
  }

  // Only Falta-info routes pending: no headline count applies, so lead with
  // the raw pending total instead of the resolved-only subject.
  if (content.totalPending > 0) {
    return formatCount(copy.pending, content.totalPending);
  }

  return formatCount(copy.resolvedOnly, content.resolvedCount);
}

type ItemView = {
  href: string;
  strip: string;
  title: string;
  meta: string[];
};

function itemView(item: DigestItem, locale: string, appUrl: string): ItemView {
  const dictionary = getDictionary(locale);
  const daysLabel = (days: number) =>
    days > 0 ? dictionary.overview.daysWaiting.replace("{days}", String(days)) : null;

  if (item.kind === "route") {
    return {
      href: `${appUrl}${item.href}`,
      strip: SEVERITY_STRIP[item.status],
      title: item.reference,
      meta: [
        item.customerName,
        dictionary.statuses[item.status],
        daysLabel(item.daysWaiting),
        ...item.missingLabels,
      ].filter((part): part is string => Boolean(part)),
    };
  }

  if (item.kind === "intake") {
    return {
      href: `${appUrl}${item.href}`,
      strip: SEVERITY_STRIP.inbound,
      title: item.title,
      meta: [
        `${dictionary.overview.received} ${formatRegionalDateTime(item.receivedAt, locale, {
          month: "short",
          day: "numeric",
        })}`,
      ],
    };
  }

  return {
    href: `${appUrl}${item.href}`,
    strip: SEVERITY_STRIP.inbound,
    title: dictionary.overview.whatsappSource.title,
    meta: [item.label, daysLabel(item.daysWaiting)].filter((part): part is string => Boolean(part)),
  };
}

export function renderDigestEmail(args: {
  content: DigestContent;
  locale: string;
  appUrl: string;
  workspaceName: string;
}): DigestEmail {
  const { content, locale, workspaceName } = args;
  const appUrl = args.appUrl.replace(/\/$/, "");
  const dictionary = getDictionary(locale);
  const copy = dictionary.digestEmail;
  const subject = buildDigestSubject(content, locale);

  const countRows = [
    { value: content.counts.routesAwaitingDecision, label: copy.counts.routes },
    { value: content.counts.evidenceToLink, label: copy.counts.evidence },
    { value: content.counts.newWhatsappSources, label: copy.counts.sources },
  ].filter((row) => row.value > 0);

  const items = content.items.map((item) => itemView(item, locale, appUrl));
  const resolvedLine = content.resolvedCount > 0 ? formatCount(copy.resolved, content.resolvedCount) : null;
  const settingsUrl = `${appUrl}/settings`;

  const countsHtml = countRows
    .map(
      (row) => `
        <tr>
          <td style="padding:4px 0;font-size:22px;font-weight:700;color:${INK};width:44px;font-variant-numeric:tabular-nums;">${row.value}</td>
          <td style="padding:4px 0;font-size:14px;color:${MUTED};">${escapeHtml(row.label)}</td>
        </tr>`,
    )
    .join("");

  const itemsHtml = items
    .map(
      (item) => `
      <tr>
        <td style="padding:0 0 8px;">
          <a href="${item.href}" style="display:block;text-decoration:none;background:#ffffff;border:1px solid ${LINE};border-left:3px solid ${item.strip};border-radius:10px;padding:12px 14px;">
            <span style="display:block;font-size:14px;font-weight:700;color:${INK};">${escapeHtml(item.title)}</span>
            <span style="display:block;padding-top:2px;font-size:12px;color:${MUTED};">${item.meta.map(escapeHtml).join(" &middot; ")}</span>
          </a>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
          <tr>
            <td style="padding:0 4px 14px;">
              <span style="font-size:16px;font-weight:800;letter-spacing:-0.01em;color:${INK};">FleteOps</span>
              <span style="font-size:12px;color:${MUTED};"> &nbsp;&middot;&nbsp; ${escapeHtml(workspaceName)}</span>
            </td>
          </tr>
          ${
            countRows.length > 0
              ? `<tr>
            <td style="padding:0 0 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:6px 16px;">
                ${countsHtml}
              </table>
            </td>
          </tr>`
              : ""
          }
          ${
            items.length > 0
              ? `<tr>
            <td style="padding:0 4px 8px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(copy.pendingTitle)}</td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${itemsHtml}
              </table>
            </td>
          </tr>`
              : ""
          }
          ${
            resolvedLine
              ? `<tr>
            <td style="padding:6px 4px 0;font-size:13px;color:${MUTED};">${escapeHtml(resolvedLine)}</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:22px 4px 0;border-top:0;">
              <a href="${settingsUrl}" style="font-size:12px;color:${ACCENT};text-decoration:none;">${escapeHtml(copy.adjustFrequency)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `FleteOps · ${workspaceName}`,
    "",
    ...countRows.map((row) => `${row.value}  ${row.label}`),
    ...(items.length > 0 ? ["", copy.pendingTitle, ...items.map((item) => `- ${item.title} (${item.meta.join(" · ")})\n  ${item.href}`)] : []),
    ...(resolvedLine ? ["", resolvedLine] : []),
    "",
    `${copy.adjustFrequency}: ${settingsUrl}`,
  ].join("\n");

  return { subject, html, text };
}
