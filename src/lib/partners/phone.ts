export function normalizePhoneNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function formatPhoneNumberForStorage(value: string) {
  return value.trim();
}
