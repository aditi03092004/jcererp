/**
 * Cloudflare R2 Service
 *
 * Manages all interactions with Cloudflare R2 (S3-compatible storage).
 *
 * Architecture:
 *  - Bucket is PRIVATE. Student documents are never publicly accessible.
 *  - Object *keys* (not full URLs) are stored in the database for portability.
 *  - Short-lived signed URLs are generated on-demand by the backend and returned
 *    to authorised callers only (admin/student, after auth + ownership checks).
 *
 * Key format:
 *  admissions/<studentId>/<fieldname>/<timestamp>-<random>.<ext>
 *  handbook/handbook-<timestamp>.pdf
 *  fee-receipts/<studentId>/<timestamp>-<random>.<ext>
 */

import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import logger from '../utils/logger.util';

// ── S3 client pointing at Cloudflare R2 ──────────────────────────────────────
const s3 = new AWS.S3({
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: 'v4',
  region: process.env.R2_REGION || 'auto',
});

const BUCKET = process.env.R2_BUCKET_NAME || '';

// ── Signed-URL TTL (seconds) ──────────────────────────────────────────────────
const SIGNED_URL_TTL = 5 * 60; // 5 minutes — enough to open the document

// ── Key helpers ───────────────────────────────────────────────────────────────

/**
 * Build an R2 object key for an admission document.
 * Kept short enough to fit within the VARCHAR(255) DB column.
 */
export function buildDocumentKey(
  studentId: string,
  fieldName: string,
  originalName: string,
): string {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `admissions/${studentId}/${fieldName}/${uniqueSuffix}${ext}`;
}

/** Build an R2 object key for a fee receipt. */
export function buildFeeReceiptKey(studentId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `fee-receipts/${studentId}/${uniqueSuffix}${ext}`;
}

/** Build an R2 object key for the admission handbook PDF. */
export function buildHandbookKey(): string {
  return `handbook/handbook-${Date.now()}.pdf`;
}

/**
 * Process and compress an image buffer using sharp to a target max size while preserving legibility.
 *
 * Strategy:
 *  - Non-images (PDFs): pass through completely unchanged.
 *  - Images (JPG/PNG/GIF):
 *    1. Check dimensions: if width or height exceeds 2000px, resize down to a max of 2000px
 *       (fit inside, keeping aspect ratio). This avoids massive camera resolution files while
 *       keeping documents perfectly readable.
 *    2. Compress using quality levels (85% -> 75% -> 65%). We stop as soon as size is <= 2MB,
 *       and we never drop quality below 65% to ensure text readability (Aadhaar/Marks cards).
 *    3. Fallback: if sharp fails or file remains > 2MB, we upload the best result to preserve upload integrity.
 */
const TARGET_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB target per image
const MAX_DIMENSION = 2000;                // Max width/height to preserve fine details
const QUALITY_STEPS = [85, 75, 65];         // High-readability quality steps

async function compressIfImage(buffer: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string }> {
  const isImage = contentType.startsWith('image/');
  if (!isImage) {
    // PDF, handbook, etc. — pass through as-is
    return { buffer, contentType };
  }

  try {
    const pipeline = sharp(buffer).rotate(); // Auto-orient based on EXIF headers
    const metadata = await pipeline.metadata();

    const needsResize = metadata.width && metadata.height && (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION);
    const needsCompression = buffer.length > TARGET_SIZE_BYTES;

    // If it's already within limits, upload original directly
    if (!needsResize && !needsCompression) {
      return { buffer, contentType };
    }

    logger.info(`[R2] Image processing required: size=${(buffer.length / 1024).toFixed(0)}KB, dimensions=${metadata.width || 0}x${metadata.height || 0}`);

    let processedPipeline = pipeline;
    if (needsResize) {
      logger.info(`[R2] Resizing image to fit inside ${MAX_DIMENSION}x${MAX_DIMENSION}px`);
      processedPipeline = processedPipeline.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    let result = buffer;
    for (const quality of QUALITY_STEPS) {
      const compressed = await processedPipeline
        .clone()
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      logger.info(`[R2] JPEG Compression at quality=${quality}: ${(compressed.length / 1024).toFixed(0)} KB`);
      result = compressed;

      if (compressed.length <= TARGET_SIZE_BYTES) {
        break; // Met the target size
      }
    }

    logger.info(`[R2] Processed image result: ${(result.length / 1024).toFixed(0)} KB`);
    return { buffer: result, contentType: 'image/jpeg' };

  } catch (err) {
    logger.warn('[R2] Sharp image processing failed, uploading original fallback:', err);
    return { buffer, contentType };
  }
}

/**
 * Upload a file buffer to R2 (with compression for images).
 * @returns The R2 object key (store this in the database).
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const { buffer: finalBuffer, contentType: finalContentType } = await compressIfImage(buffer, contentType);

  logger.info(`[R2] Uploading: ${key} (${(finalBuffer.length / 1024).toFixed(0)} KB)`);
  await s3.putObject({
    Bucket: BUCKET,
    Key: key,
    Body: finalBuffer,
    ContentType: finalContentType,
  }).promise();
  logger.info(`[R2] Uploaded successfully: ${key}`);
  return key;
}

/**
 * Upload a raw ZIP archive directly to R2 without any transformations.
 */
export async function uploadZipBuffer(
  buffer: Buffer,
  key: string,
  filename?: string,
): Promise<string> {
  const cleanKey = key.replace(/^\/+/, '');
  const contentDisposition = filename ? `attachment; filename="${filename}"` : 'attachment';

  logger.info(`[R2] Uploading ZIP archive: ${cleanKey} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);
  await s3.putObject({
    Bucket: BUCKET,
    Key: cleanKey,
    Body: buffer,
    ContentType: 'application/zip',
    ContentDisposition: contentDisposition,
  }).promise();
  logger.info(`[R2] ZIP uploaded successfully: ${cleanKey}`);
  return cleanKey;
}

/**
 * Upload a file from local disk to R2, compress images, then remove the local file.
 *
 * Flow:
 *   Student uploads up to 10 MB
 *     → Multer saves to local temp disk
 *     → magic-byte + quality validation (done in middleware, unchanged)
 *     → this function reads the temp file, compresses if image, uploads to R2
 *     → local temp file deleted
 *
 * @returns The R2 object key.
 */
export async function uploadFromDisk(
  localPath: string,
  key: string,
  contentType: string,
): Promise<string> {
  const buffer = fs.readFileSync(localPath);
  await uploadFile(buffer, key, contentType);
  // Remove local temp file
  try {
    fs.unlinkSync(localPath);
  } catch (cleanupErr) {
    logger.warn(`[R2] Could not delete local temp file after upload: ${localPath}`, cleanupErr);
  }
  return key;
}

/**
 * Generates equivalent alternative object keys by normalizing:
 * 1. Academic year format: YYYY-YYYY <-> YYYY-YY (e.g. 2026-2027 <-> 2026-27)
 * 2. Department code alias: /CV/ <-> /CE/
 */
export function getR2KeyVariants(key: string): string[] {
  if (!key) return [];
  const cleanKey = key.replace(/^\/+/, '');
  const variants = new Set<string>();

  // 1. Year variants: YYYY-YYYY <-> YYYY-YY
  const fourDigitYear = cleanKey.match(/^(\d{4})-(\d{4})\/(.*)$/);
  if (fourDigitYear) {
    const shortYear = `${fourDigitYear[1]}-${fourDigitYear[2].slice(-2)}`;
    variants.add(`${shortYear}/${fourDigitYear[3]}`);
  }

  const twoDigitYear = cleanKey.match(/^(\d{4})-(\d{2})\/(.*)$/);
  if (twoDigitYear) {
    const longYear = `${twoDigitYear[1]}-20${twoDigitYear[2]}`;
    variants.add(`${longYear}/${twoDigitYear[3]}`);
  }

  // 2. Department code variants: /CV/ <-> /CE/
  for (const v of Array.from(variants).concat(cleanKey)) {
    if (v.includes('/CV/')) {
      variants.add(v.replace('/CV/', '/CE/'));
    } else if (v.includes('/CE/')) {
      variants.add(v.replace('/CE/', '/CV/'));
    }
  }

  variants.delete(cleanKey);
  return Array.from(variants);
}

/**
 * List objects in R2 matching a prefix.
 */
export async function listObjects(prefix: string, maxKeys: number = 1000): Promise<AWS.S3.Object[]> {
  const cleanPrefix = prefix.replace(/^\/+/, '');
  try {
    const res = await s3.listObjectsV2({
      Bucket: BUCKET,
      Prefix: cleanPrefix,
      MaxKeys: maxKeys,
    }).promise();
    return res.Contents || [];
  } catch (err: any) {
    logger.warn(`[R2] listObjects failed for prefix '${cleanPrefix}': ${err.message}`);
    return [];
  }
}

/**
 * Retrieves metadata and headers for an R2 object.
 * Attempts equivalent key variants if direct key returns 404/NotFound.
 */
export async function headFile(key: string): Promise<AWS.S3.HeadObjectOutput> {
  const cleanKey = key.replace(/^\/+/, '');
  try {
    return await s3.headObject({ Bucket: BUCKET, Key: cleanKey }).promise();
  } catch (err: any) {
    const variants = getR2KeyVariants(cleanKey);
    for (const altKey of variants) {
      try {
        return await s3.headObject({ Bucket: BUCKET, Key: altKey }).promise();
      } catch {
        // try next variant
      }
    }
    throw err;
  }
}

/**
 * Delete an object from R2 by its key.
 * Fails silently (only logs) so a missing old file never blocks a new upload.
 */
export async function deleteFile(key: string | null | undefined): Promise<void> {
  if (!key) return;
  // Only attempt deletion for keys that look like R2 paths (not legacy local /uploads/ paths)
  if (key.startsWith('/') || key.startsWith('http')) {
    logger.info(`[R2] Skipping deletion of legacy local path: ${key}`);
    return;
  }
  try {
    logger.info(`[R2] Deleting: ${key}`);
    await s3.deleteObject({ Bucket: BUCKET, Key: key }).promise();
    logger.info(`[R2] Deleted: ${key}`);
  } catch (err) {
    logger.error(`[R2] Failed to delete object: ${key}`, err);
  }
}

/**
 * Generate a short-lived signed GET URL for a private R2 object.
 * @param key  The R2 object key stored in the database.
 * @param ttl  Seconds until the URL expires (default 5 min).
 */
export async function getSignedUrl(
  key: string,
  ttl: number = SIGNED_URL_TTL,
  downloadFilename?: string,
): Promise<string> {
  if (!key) return '';
  const cleanKey = key.replace(/^\/+/, '');
  if (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    try {
      const params: any = {
        Bucket: BUCKET,
        Key: cleanKey,
        Expires: ttl,
      };
      if (downloadFilename) {
        params.ResponseContentType = 'application/zip';
        params.ResponseContentDisposition = `attachment; filename="${downloadFilename}"`;
      }
      return s3.getSignedUrlPromise('getObject', params);
    } catch (err: any) {
      logger.warn(`[R2] Presigned URL generation fallback: ${err.message}`);
    }
  }
  return resolveFileUrl(key);
}

/**
 * Generate a short-lived signed GET URL for a private R2 object synchronously.
 */
export function getSignedUrlSync(
  key: string,
  ttl: number = SIGNED_URL_TTL,
  downloadFilename?: string,
): string {
  if (!key) return '';
  const cleanKey = key.replace(/^\/+/, '');
  if (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    try {
      const params: any = {
        Bucket: BUCKET,
        Key: cleanKey,
        Expires: ttl,
      };
      if (downloadFilename) {
        params.ResponseContentType = 'application/zip';
        params.ResponseContentDisposition = `attachment; filename="${downloadFilename}"`;
      }
      return s3.getSignedUrl('getObject', params);
    } catch (err: any) {
      logger.warn(`[R2] Presigned URL sync generation fallback: ${err.message}`);
    }
  }
  return resolveFileUrl(key);
}

/**
 * Fetch file buffer from Cloudflare R2.
 * Attempts equivalent key variants if direct key is not found.
 */
export async function getFile(key: string): Promise<Buffer> {
  const cleanKey = key.replace(/^\/+/, '');
  try {
    const data = await s3.getObject({ Bucket: BUCKET, Key: cleanKey }).promise();
    return data.Body as Buffer;
  } catch (err: any) {
    const variants = getR2KeyVariants(cleanKey);
    for (const altKey of variants) {
      try {
        const data = await s3.getObject({ Bucket: BUCKET, Key: altKey }).promise();
        return data.Body as Buffer;
      } catch {
        // try next variant
      }
    }
    throw err;
  }
}

/**
 * Fetch file stream from Cloudflare R2 for memory-efficient streaming.
 */
export function getFileStream(key: string): NodeJS.ReadableStream {
  const cleanKey = key.replace(/^\/+/, '');
  return s3.getObject({ Bucket: BUCKET, Key: cleanKey }).createReadStream();
}

/**
 * Resolve an object key or local path to a fully qualified or static URL.
 */
export function resolveFileUrl(keyOrPath: string): string {
  if (!keyOrPath) return '';
  if (keyOrPath.startsWith('http://') || keyOrPath.startsWith('https://')) {
    return keyOrPath;
  }
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${keyOrPath.replace(/^\//, '')}`;
  }
  if (keyOrPath.startsWith('/uploads/') || keyOrPath.startsWith('uploads/')) {
    return keyOrPath.startsWith('/') ? keyOrPath : `/${keyOrPath}`;
  }
  return `/api/documents/view/${encodeURIComponent(keyOrPath)}`;
}
