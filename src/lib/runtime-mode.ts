/** Safe by default. Connected services require explicit server-side opt-in. */
export function isDemoMode(mode = process.env.FLETEOPS_MODE): boolean {
  return mode !== "connected";
}

export function demoApiDisabled(): Response {
  return Response.json({ error: "Connected services are disabled in the synthetic demo." }, { status: 403 });
}
