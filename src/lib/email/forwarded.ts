import { addressParser } from "postal-mime";

export type ForwardedEmailMetadata = {
  isForwarded: boolean;
  fromName: string | null;
  fromAddress: string | null;
  subject: string | null;
  sentAt: string | null;
};

function cleanNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseMailbox(value: string | null) {
  if (!value) {
    return {
      fromName: null,
      fromAddress: null,
    };
  }

  try {
    const [mailbox] = addressParser(value, { flatten: true });
    if (!mailbox) {
      return {
        fromName: null,
        fromAddress: cleanNullable(value),
      };
    }

    return {
      fromName: cleanNullable(mailbox.name),
      fromAddress: cleanNullable(mailbox.address),
    };
  } catch {
    return {
      fromName: null,
      fromAddress: cleanNullable(value),
    };
  }
}

function matchForwardedHeader(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanNullable(match[1]);
    }
  }

  return null;
}

export function extractForwardedEmailMetadata(args: {
  subject?: string | null;
  textBody?: string | null;
}) {
  const subject = cleanNullable(args.subject);
  const textBody = cleanNullable(args.textBody);
  const isForwardedBySubject = Boolean(subject && /^(fw|fwd|rv|enc)\s*:/i.test(subject));

  if (!textBody) {
    return isForwardedBySubject
      ? ({
          isForwarded: true,
          fromName: null,
          fromAddress: null,
          subject: null,
          sentAt: null,
        } satisfies ForwardedEmailMetadata)
      : null;
  }

  const excerpt = textBody.slice(0, 4000);
  const forwardedFromRaw = matchForwardedHeader(excerpt, [
    /^\s*from\s*:\s*(.+)$/im,
    /^\s*de\s*:\s*(.+)$/im,
  ]);
  const forwardedSubject = matchForwardedHeader(excerpt, [
    /^\s*subject\s*:\s*(.+)$/im,
    /^\s*asunto\s*:\s*(.+)$/im,
  ]);
  const forwardedDate = matchForwardedHeader(excerpt, [
    /^\s*date\s*:\s*(.+)$/im,
    /^\s*fecha\s*:\s*(.+)$/im,
  ]);

  const hasForwardedHeaders = Boolean(forwardedFromRaw || forwardedSubject || forwardedDate);

  if (!isForwardedBySubject && !hasForwardedHeaders) {
    return null;
  }

  const mailbox = parseMailbox(forwardedFromRaw);

  return {
    isForwarded: true,
    fromName: mailbox.fromName,
    fromAddress: mailbox.fromAddress,
    subject: forwardedSubject,
    sentAt: forwardedDate,
  } satisfies ForwardedEmailMetadata;
}

function isForwardedMarker(line: string) {
  return /forwarded message|mensaje reenviado|begin forwarded/i.test(line);
}

function isForwardedHeaderLine(line: string) {
  return /^\s*(from|de|date|fecha|subject|asunto|to|para|cc)\s*:/i.test(line);
}

export function extractForwardedEmailOperationalBody(textBody?: string | null) {
  const cleaned = cleanNullable(textBody);

  if (!cleaned) {
    return null;
  }

  const lines = cleaned.split(/\r?\n/);
  const markerIndex = lines.findIndex(isForwardedMarker);

  if (markerIndex < 0) {
    return null;
  }

  let sawForwardedHeader = false;

  for (let index = markerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      if (sawForwardedHeader) {
        return cleanNullable(lines.slice(index + 1).join("\n"));
      }

      continue;
    }

    if (isForwardedHeaderLine(line)) {
      sawForwardedHeader = true;
      continue;
    }

    if (sawForwardedHeader) {
      return cleanNullable(lines.slice(index).join("\n"));
    }
  }

  return null;
}
