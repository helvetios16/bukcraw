/**
 * Represents the result of a scrape operation.
 */
export interface ScrapeResult {
  title: string;
  contentLength: number;
}

/**
 * Represents a book with detailed information extracted from Goodreads.
 */
export interface Book {
  id: string;
  title: string;
  legacyId?: number;
  titleComplete?: string;
  description?: string;
  author?: string;
  webUrl?: string;
  averageRating?: number;
  pageCount?: number;
  language?: string;
  format?: string;
  coverImage?: string;
  updatedAt?: string;
}

export interface Blog {
  id: string;
  title: string;
  webUrl?: string;
  description?: string;
  imageUrl?: string;
  content?: string;
  author?: string;
  createdAt?: string;
  tags?: string[];
  mentionedBooks?: (Book & { section?: string })[];
}

/**
 * Options for filtering book editions.
 */
export interface BookFilterOptions {
  sort?: string;
  format?: string;
  language?: string;
}

export interface Edition {
  title: string;
  link: string;
  coverImage?: string;
  format?: string;
  pages?: number;
  publishedDate?: string;
  publisher?: string;
  description?: string;
  language?: string;
  averageRating?: number;
  createdAt?: string;
}

/**
 * Type guard to validate if parsed JSON is a valid Blog object.
 */
export function isBlog(data: unknown): data is Blog {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.title === "string";
}

/**
 * Type guard to validate if parsed JSON has a valid EditionsFilters structure.
 * Imported and used in goodreads-service.ts for cache validation.
 */
export function isEditionsFilters(
  data: unknown,
): data is { sort: unknown[]; format: unknown[]; language: unknown[] } {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return Array.isArray(obj.sort) && Array.isArray(obj.format) && Array.isArray(obj.language);
}
