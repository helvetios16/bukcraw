import { createHash } from "node:crypto";

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalizes an error object into a readable string message.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Generates a consistent MD5 hash for a given URL.
 */
export function hashUrl(url: string): string {
  if (!url || typeof url !== "string") {
    throw new Error("Invalid URL provided for hashing");
  }
  return createHash("md5").update(url).digest("hex");
}

/**
 * Validates if a string is a potentially valid Book ID (numeric or numeric-slug).
 */
export function isValidBookId(id: string): boolean {
  // Matches "12345", "12345-some-slug", or "12345.Some_Title"
  return /^\d+([.-][\w.-]+)?$/.test(id);
}

/**
 * Validates if a string is a valid URL.
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
