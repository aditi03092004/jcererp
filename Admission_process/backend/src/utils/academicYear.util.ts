/**
 * Academic Year Normalization & Comparison Utility
 * 
 * Provides standard normalization across diverse academic year representations:
 * - Hyphen, en-dash, em-dash, slashes ("2026-2027", "2026–2027", "2026/2027", "2026 - 2027", "2026–27")
 * - 4-digit and 2-digit end years ("2026-2027" -> "2026-27", "2026-27" -> "2026-27")
 * - Canonical internal representation: "YYYY-YY" (e.g., "2026-27")
 */

/**
 * Normalizes any academic-year string into the canonical "YYYY-YY" format (e.g. "2026-27").
 *
 * @param value Raw academic year input string
 * @returns Canonical academic year string (e.g. "2026-27") or empty string if invalid/empty
 */
export function normalizeAcademicYear(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value).trim();
  if (!str) {
    return '';
  }

  // Matches 4-digit start year, separator (dash, en-dash, em-dash, slash, backslash), and 2-4 digit end year
  // Unicode dash ranges: \u002D (hyphen), \u2010-\u2015 (hyphens/dashes), \u2212 (minus)
  const rangeMatch = str.match(/^(\d{4})\s*[\-\u2010-\u2015\u2212\/\\]\s*(\d{2,4})$/);
  if (rangeMatch) {
    const startYear = rangeMatch[1];
    let endYear = rangeMatch[2];
    if (endYear.length === 4) {
      endYear = endYear.slice(-2);
    } else if (endYear.length === 1) {
      endYear = endYear.padStart(2, '0');
    }
    return `${startYear}-${endYear}`;
  }

  // Matches single 4-digit year like "2026" -> converts to "2026-27"
  const singleMatch = str.match(/^(\d{4})$/);
  if (singleMatch) {
    const startYear = parseInt(singleMatch[1], 10);
    const endYear = ((startYear + 1) % 100).toString().padStart(2, '0');
    return `${startYear}-${endYear}`;
  }

  // Fallback: replace Unicode dashes with standard hyphen and collapse multiple spaces
  return str
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether two academic year representations refer to the same academic year.
 *
 * @param year1 First academic year string
 * @param year2 Second academic year string
 * @returns True if both represent the same academic year
 */
export function areAcademicYearsEqual(
  year1?: string | null,
  year2?: string | null
): boolean {
  if (!year1 || !year2) {
    return false;
  }

  const norm1 = normalizeAcademicYear(year1);
  const norm2 = normalizeAcademicYear(year2);

  if (norm1 && norm2) {
    return norm1 === norm2;
  }

  return String(year1).trim().toLowerCase() === String(year2).trim().toLowerCase();
}

export function getAcademicYearVariants(ay?: string | null): string[] {
  if (!ay || ay === 'ALL') return [];
  const trimmed = ay.trim();
  // Strip optional "AY:" or "AY" prefix for base parsing
  const stripped = trimmed.replace(/^AY\s*:?\s*/i, '').trim();
  const clean = stripped.replace(/[\u2010-\u2015\u2212]/g, '-');
  
  const variants = new Set<string>([ay, trimmed, stripped, clean]);
  
  // Format: "YYYY-YY" e.g. "2026-27"
  const match2 = clean.match(/^(\d{4})[-\/\s]+(\d{2})$/);
  if (match2) {
    const startYear = match2[1];
    const endShort = match2[2];
    const endCentury = startYear.slice(0, 2);
    const fullEndYear = `${endCentury}${endShort}`;
    
    // Core representations
    variants.add(`${startYear}-${endShort}`);
    variants.add(`${startYear}-${fullEndYear}`);
    variants.add(`${startYear}\u2013${endShort}`);
    variants.add(`${startYear}\u2013${fullEndYear}`);
    variants.add(`${startYear}\u2014${endShort}`);
    variants.add(`${startYear}\u2014${fullEndYear}`);
    variants.add(`${startYear}/${endShort}`);
    variants.add(`${startYear}/${fullEndYear}`);
    variants.add(`${startYear} - ${endShort}`);
    variants.add(`${startYear} - ${fullEndYear}`);
    variants.add(`${startYear} \u2013 ${endShort}`);
    variants.add(`${startYear} \u2013 ${fullEndYear}`);

    // With AY prefix
    variants.add(`AY ${startYear}-${endShort}`);
    variants.add(`AY ${startYear}-${fullEndYear}`);
    variants.add(`AY ${startYear}\u2013${endShort}`);
    variants.add(`AY ${startYear}\u2013${fullEndYear}`);
    variants.add(`AY: ${startYear}-${endShort}`);
    variants.add(`AY: ${startYear}-${fullEndYear}`);
  }
  
  // Format: "YYYY-YYYY" e.g. "2026-2027"
  const match4 = clean.match(/^(\d{4})[-\/\s]+(\d{4})$/);
  if (match4) {
    const startYear = match4[1];
    const fullEndYear = match4[2];
    const endShort = fullEndYear.slice(2);

    variants.add(`${startYear}-${endShort}`);
    variants.add(`${startYear}-${fullEndYear}`);
    variants.add(`${startYear}\u2013${endShort}`);
    variants.add(`${startYear}\u2013${fullEndYear}`);
    variants.add(`${startYear}\u2014${endShort}`);
    variants.add(`${startYear}\u2014${fullEndYear}`);
    variants.add(`${startYear}/${endShort}`);
    variants.add(`${startYear}/${fullEndYear}`);
    variants.add(`${startYear} - ${endShort}`);
    variants.add(`${startYear} - ${fullEndYear}`);
    variants.add(`${startYear} \u2013 ${endShort}`);
    variants.add(`${startYear} \u2013 ${fullEndYear}`);

    // With AY prefix
    variants.add(`AY ${startYear}-${endShort}`);
    variants.add(`AY ${startYear}-${fullEndYear}`);
    variants.add(`AY ${startYear}\u2013${endShort}`);
    variants.add(`AY ${startYear}\u2013${fullEndYear}`);
    variants.add(`AY: ${startYear}-${endShort}`);
    variants.add(`AY: ${startYear}-${fullEndYear}`);
  }

  return Array.from(variants).filter(Boolean);
}

export default {
  normalizeAcademicYear,
  areAcademicYearsEqual,
  getAcademicYearVariants,
};
