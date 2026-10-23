import { getOutboundEmailFrom, getResendApiKey } from "@/lib/env";

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type OutboundSendResult =
  | { status: "sent"; id: string | null }
  | { status: "skipped"; reason: "sender_not_configured" }
  | { status: "error"; detail: string };

export function isOutboundEmailConfigured() {
  return Boolean(getResendApiKey());
}

export async function sendOutboundEmail(message: OutboundEmail): Promise<OutboundSendResult> {
  const apiKey = getResendApiKey();

  if (!apiKey) {
    return { status: "skipped", reason: "sender_not_configured" };
  }

  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: getOutboundEmailFrom(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
  } catch (error) {
    return { status: "error", detail: error instanceof Error ? error.message : String(error) };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { status: "error", detail: `Resend ${response.status}: ${detail.slice(0, 300)}` };
  }

  const payload = (await response.json().catch(() => null)) as { id?: string } | null;

  return { status: "sent", id: payload?.id ?? null };
}
