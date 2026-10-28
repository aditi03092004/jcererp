/**
 * r2Key.util.ts
 * 
 * Central utility for generating Cloudflare R2 object keys.
 * 
 * ALL document uploads in the system must use `buildR2Key()` to generate
 * the storage key. This guarantees a single, consistent folder structure:
 * 
 *   {academicYear}/{branchCode}/{studentName} - {applicationNumber}/{documentFileName}
 * 
 * Example:
 *   2026-2027/CE/Yuvraj Talawar - JCER-2026-CE-00007/Aadhaar.pdf
 */

/**
 * Sanitize a student name for safe use in an R2 object key.
 * - Removes / \ and other path-unsafe characters
 * - Collapses multiple spaces
 * - Trims leading/trailing whitespace
 * - Preserves readable name
 */
export function sanitizeStudentName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '')   // remove path-unsafe chars
    .replace(/\.{2,}/g, '')          // remove directory traversal dot-dot sequences
    .replace(/^\.+|\.+$/g, '')       // remove leading and trailing dots
    .replace(/\s+/g, ' ')            // collapse multiple spaces
    .trim();
}

/**
 * Build the R2 folder prefix for a student.
 * Returns: "{academicYear}/{branchCode}/{studentName} - {applicationNumber}"
 */
export function buildR2Folder(opts: {
  academicYear: string;
  branchCode: string;
  studentName: string;
  applicationNumber: string;
}): string {
  const { academicYear, branchCode, studentName, applicationNumber } = opts;
  const safeName = sanitizeStudentName(studentName || 'Student');
  return `${academicYear}/${branchCode}/${safeName} - ${applicationNumber}`;
}

/**
 * Build a full R2 object key for a document file.
 * Returns: "{academicYear}/{branchCode}/{studentName} - {applicationNumber}/{mappedDocName}{ext}"
 *
 * @param opts.academicYear  e.g. "2026-2027"
 * @param opts.branchCode    e.g. "CE"
 * @param opts.studentName   Full name from User model (first + last). Will be sanitized.
 * @param opts.applicationNumber e.g. "JCER-2026-CE-00007"
 * @param opts.mappedDocName Display name for the document e.g. "Aadhaar", "Photo"
 * @param opts.ext           File extension including dot, e.g. ".pdf", ".jpg"
 */
export function buildR2Key(opts: {
  academicYear: string;
  branchCode: string;
  studentName: string;
  applicationNumber: string;
  mappedDocName: string;
  ext: string;
}): string {
  const folder = buildR2Folder(opts);
  return `${folder}/${opts.mappedDocName}${opts.ext}`;
}
