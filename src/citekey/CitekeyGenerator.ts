import type { MendeleyDocument, MendeleyPersonName } from "../api/types";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "on",
  "in",
  "and",
  "or",
  "to",
  "for",
  "de",
  "la",
  "el",
  "los",
  "las",
  "y",
  "un",
  "una",
]);

export function slugifyCitekeyPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function firstSignificantWord(title: string | undefined): string {
  if (!title) return "untitled";
  const words = title
    .split(/\s+/)
    .map((w) => slugifyCitekeyPart(w))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return words[0] || "untitled";
}

export function baseCitekeyFromMetadata(doc: MendeleyDocument): string {
  const firstAuthor: MendeleyPersonName | undefined = doc.authors?.[0];
  const authorPart = firstAuthor?.last_name
    ? slugifyCitekeyPart(firstAuthor.last_name)
    : "unknown";
  const yearPart = doc.year ? String(doc.year) : "nd";
  const wordPart = firstSignificantWord(doc.title);
  return `${authorPart}${yearPart}${wordPart}`;
}

/**
 * Uses Mendeley's native citation_key field when present (available with
 * view=bib/all); otherwise builds authorYear+firstTitleWord. Either way, it
 * disambiguates against citekeys already used in the vault or earlier in the
 * same run.
 */
export function generateCitekey(
  doc: MendeleyDocument,
  existingCitekeys: ReadonlySet<string>
): string {
  const preferred = doc.citation_key?.trim();
  const base =
    preferred && preferred.length > 0
      ? preferred
      : baseCitekeyFromMetadata(doc);
  return disambiguate(base, existingCitekeys);
}

function disambiguate(
  base: string,
  existingCitekeys: ReadonlySet<string>
): string {
  if (!existingCitekeys.has(base)) return base;
  const suffixes = "abcdefghijklmnopqrstuvwxyz";
  for (const suffix of suffixes) {
    const candidate = `${base}${suffix}`;
    if (!existingCitekeys.has(candidate)) return candidate;
  }
  let n = 2;
  while (existingCitekeys.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
