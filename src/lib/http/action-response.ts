export type ActionResponse = {
  ok?: boolean;
  error?: string;
};

export async function readActionResponse(response: Response, fallbackError: string) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as ActionResponse;
      return payload;
    } catch {
      return { ok: response.ok, error: response.ok ? undefined : fallbackError };
    }
  }

  if (response.ok) {
    return { ok: true };
  }

  const body = await response.text().catch(() => "");
  const normalizedBody = body.trim();
  const shouldExposeBody = normalizedBody && !normalizedBody.startsWith("<");

  return {
    ok: false,
    error: shouldExposeBody ? normalizedBody : fallbackError,
  };
}
