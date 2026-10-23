const lowercaseParticles = new Set([
  "a",
  "al",
  "da",
  "das",
  "de",
  "del",
  "do",
  "dos",
  "e",
  "el",
  "la",
  "las",
  "los",
  "y",
]);

const preservedAcronyms = new Set(["CDMX", "CP", "GDL", "MTY", "MX", "N.L", "N.L.", "USA", "US", "C.P."]);

const titleAbbreviations = new Map([
  ["AV", "Av"],
  ["AV.", "Av."],
  ["BLVD", "Blvd"],
  ["BLVD.", "Blvd."],
  ["COL", "Col"],
  ["COL.", "Col."],
  ["NO", "No"],
  ["NO.", "No."],
  ["NUM", "Num"],
  ["NUM.", "Num."],
  ["NÚM", "Núm"],
  ["NÚM.", "Núm."],
]);

function cleanWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function looksLikeAllCapsCsvText(value: string) {
  const letters = value.match(/\p{L}/gu) ?? [];

  if (!letters.length) {
    return false;
  }

  const uppercaseCount = letters.filter((letter) => /\p{Lu}/u.test(letter)).length;
  const lowercaseCount = letters.length - uppercaseCount;

  return uppercaseCount > 0 && (lowercaseCount === 0 || uppercaseCount >= lowercaseCount * 2);
}

function titleCaseWord(value: string) {
  const match = value.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  const prefix = match?.[1] ?? "";
  const core = match?.[2] ?? value;
  const suffix = match?.[3] ?? "";

  if (!core) {
    return value;
  }

  const lower = core.toLocaleLowerCase("es-MX");
  return `${prefix}${lower.charAt(0).toLocaleUpperCase("es-MX")}${lower.slice(1)}${suffix}`;
}

function normalizePlainSegment(segment: string, isFirstWord: boolean, preserveSingleLetter: boolean) {
  if (!/\p{L}/u.test(segment)) {
    return segment;
  }

  const upper = segment.toLocaleUpperCase("es-MX");
  const lower = segment.toLocaleLowerCase("es-MX");

  if (preservedAcronyms.has(upper)) {
    return upper;
  }

  if (titleAbbreviations.has(upper)) {
    return titleAbbreviations.get(upper)!;
  }

  if (preserveSingleLetter && /^\p{L}$/u.test(segment)) {
    return upper;
  }

  if (/^(CP|C\.P\.?)\d+$/u.test(upper)) {
    return upper;
  }

  if (/\d/u.test(segment) && /\p{L}/u.test(segment)) {
    return upper;
  }

  if (!isFirstWord && lowercaseParticles.has(lower)) {
    return lower;
  }

  return titleCaseWord(segment);
}

function normalizeToken(token: string, isFirstWord: boolean, preserveSingleLetter = false) {
  const parts = token.split(/([/'’-])/u);
  let segmentIndex = 0;

  return parts
    .map((part) => {
      if (!part || /^[/'’-]$/u.test(part)) {
        return part;
      }

      const normalized = normalizePlainSegment(part, isFirstWord && segmentIndex === 0, preserveSingleLetter);
      segmentIndex += 1;
      return normalized;
    })
    .join("");
}

export function normalizeImportedDirectoryText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = cleanWhitespace(value);

  if (!looksLikeAllCapsCsvText(cleaned)) {
    return cleaned;
  }

  let wordIndex = 0;

  return cleaned
    .split(/(\s+)/u)
    .map((part) => {
      if (!part.trim()) {
        return part;
      }

      const hyphenParts = part.split(/(-)/u);
      const preserveSingleLetter = hyphenParts.includes("-");
      const normalized = hyphenParts
        .map((segment) => {
          if (segment === "-") {
            return segment;
          }

          return normalizeToken(segment, wordIndex === 0, preserveSingleLetter);
        })
        .join("");

      wordIndex += 1;
      return normalized;
    })
    .join("");
}
