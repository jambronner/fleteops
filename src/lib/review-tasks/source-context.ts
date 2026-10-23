export type ReviewTaskSourceKind = "email" | "whatsapp" | "upload" | "manual" | "import" | "unknown";

export type ReviewTaskSourceContext = {
  kind: ReviewTaskSourceKind;
  label: string;
  sender: string | null;
  subject: string | null;
  conversationId: string | null;
  eventId: string | null;
  receivedAt: string | null;
};

function recordValue(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return recordValue(parsed);
    } catch {
      return null;
    }
  }

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function inferSourceKind(args: {
  channel: string | null;
  email: Record<string, unknown> | null;
  attachment: Record<string, unknown> | null;
  conversationId: string | null;
}) {
  const channel = args.channel?.toLowerCase();

  if (channel === "email" || channel === "email_routing" || channel === "mailersend" || channel === "agentmail") {
    return "email";
  }

  if (channel === "whatsapp" || channel === "meta_cloud" || channel === "evolution") {
    return "whatsapp";
  }

  if (channel === "manual") {
    return "manual";
  }

  if (channel === "import" || channel === "spreadsheet_import") {
    return "import";
  }

  if (channel === "upload") {
    return "upload";
  }

  if (args.conversationId?.endsWith("@g.us") || args.conversationId?.endsWith("@s.whatsapp.net")) {
    return "whatsapp";
  }

  if (args.email || args.conversationId?.includes("@")) {
    return "email";
  }

  if (args.attachment) {
    return "upload";
  }

  return "unknown";
}

function labelForKind(kind: ReviewTaskSourceKind, locale: string) {
  if (locale === "en") {
    return {
      email: "Email",
      whatsapp: "WhatsApp",
      upload: "Upload",
      manual: "Manual",
      import: "Import",
      unknown: "Source unknown",
    }[kind];
  }

  return {
    email: "Correo",
    whatsapp: "WhatsApp",
    upload: "Carga",
    manual: "Manual",
    import: "Importación",
    unknown: "Fuente sin identificar",
  }[kind];
}

export function getReviewTaskSourceContext(
  metadata: Record<string, unknown> | string | null | undefined,
  locale: string,
): ReviewTaskSourceContext {
  const root = recordValue(metadata);
  const source = recordValue(root?.source);
  const email = recordValue(root?.email);
  const attachment = recordValue(root?.attachment);
  const forwarded = recordValue(email?.forwarded);
  const channel = stringValue(source?.channel) ?? stringValue(root?.sourceChannel);
  const senderName =
    stringValue(source?.senderName) ??
    stringValue(email?.fromName) ??
    stringValue(root?.fromName);
  const senderAddress =
    stringValue(source?.senderAddress) ??
    stringValue(email?.fromAddress) ??
    stringValue(root?.fromAddress);
  const subject =
    stringValue(source?.subject) ??
    stringValue(email?.subject) ??
    stringValue(forwarded?.subject) ??
    stringValue(root?.subject);
  const conversationId =
    stringValue(source?.externalConversationId) ??
    stringValue(root?.externalConversationId);
  const eventId =
    stringValue(source?.externalEventId) ??
    stringValue(root?.externalEventId);
  const receivedAt =
    stringValue(source?.receivedAt) ??
    stringValue(email?.receivedAt) ??
    stringValue(root?.receivedAt);
  const kind = inferSourceKind({
    channel,
    email,
    attachment,
    conversationId,
  });

  return {
    kind,
    label: labelForKind(kind, locale),
    sender: [senderName, senderAddress ? `<${senderAddress}>` : null].filter(Boolean).join(" ") || null,
    subject,
    conversationId,
    eventId,
    receivedAt,
  };
}
