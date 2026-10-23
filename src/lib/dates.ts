export function getRegionalDateLocale(appLocale: string) {
  return appLocale === "en" ? "en-GB" : "es-MX";
}

const defaultTimeZone = "America/Mexico_City";

function isLeapYear(year: number) {
  if (year % 400 === 0) {
    return true;
  }

  if (year % 100 === 0) {
    return false;
  }

  return year % 4 === 0;
}

function isValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysByMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day <= daysByMonth[month - 1];
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function parseRegionalDateInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1], 10);
    const month = Number.parseInt(isoMatch[2], 10);
    const day = Number.parseInt(isoMatch[3], 10);

    return isValidDateParts(year, month, day)
      ? `${year}-${pad(month)}-${pad(day)}`
      : null;
  }

  const regionalMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);

  if (!regionalMatch) {
    return null;
  }

  const day = Number.parseInt(regionalMatch[1], 10);
  const month = Number.parseInt(regionalMatch[2], 10);
  const year = Number.parseInt(regionalMatch[3], 10);

  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

export function formatIsoDateForField(value?: string | null) {
  if (!value) {
    return "";
  }

  const parsed = parseRegionalDateInput(value);

  if (!parsed) {
    return "";
  }

  const [year, month, day] = parsed.split("-");
  return `${day}/${month}/${year}`;
}

export function formatRegionalDateTime(
  value: string | Date,
  appLocale: string,
  options: Intl.DateTimeFormatOptions,
) {
  const parsedValue =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);

  return new Intl.DateTimeFormat(getRegionalDateLocale(appLocale), {
    timeZone: defaultTimeZone,
    ...options,
  }).format(parsedValue);
}
