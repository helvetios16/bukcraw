import { Database } from "bun:sqlite";
import type { Blog, Book, Edition } from "../types";

/**
 * Represents a raw row from the 'books' table in SQLite.
 * Fields matching SQLite behavior (NULL -> null).
 */
interface BookRow {
  readonly id: string;
  readonly legacy_id?: string;
  readonly title: string;
  readonly title_complete?: string;
  readonly author?: string;
  readonly description?: string;
  readonly average_rating?: number;
  readonly page_count?: number;
  readonly language?: string;
  readonly format?: string;
  readonly cover_image?: string;
  readonly updated_at: string;
}

/**
 * Represents a raw row from the 'blogs' table in SQLite.
 */
interface BlogRow {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly scraped_at: string;
}

/**
 * Represents a raw row from the 'editions' table in SQLite.
 */
interface EditionRow {
  readonly id: number;
  readonly book_legacy_id?: string;
  readonly title: string;
  readonly link: string;
  readonly description?: string;
  readonly language?: string;
  readonly format?: string;
  readonly average_rating?: number;
  readonly pages_count?: number;
  readonly cover_image?: string;
  readonly created_at: string;
}

/**
 * Represents a raw row from the 'sessions' table in SQLite.
 */
interface SessionRow {
  readonly id: number;
  readonly cookies: string;
  readonly created_at: string;
}

/**
 * Generic type guard factory for SQLite row validation.
 * @param requiredFields - Map of field names to their expected types.
 */
function createRowGuard<T>(requiredFields: Record<string, string>) {
  return (data: unknown): data is T => {
    if (typeof data !== "object" || data === null) {
      return false;
    }
    const d = data as Record<string, unknown>;
    return Object.entries(requiredFields).every(
      ([field, type]) => field in d && typeof d[field] === type,
    );
  };
}

const isBookRow = createRowGuard<BookRow>({ id: "string", title: "string" });
const isBlogRow = createRowGuard<BlogRow>({ id: "string", title: "string", url: "string" });
const isEditionRow = createRowGuard<EditionRow>({ title: "string", link: "string" });
const isSessionRow = createRowGuard<SessionRow>({ cookies: "string", created_at: "string" });

function mapBookRow(row: BookRow): Book {
  return {
    id: row.id,
    legacyId: row.legacy_id ? Number(row.legacy_id) : undefined,
    title: row.title,
    titleComplete: row.title_complete || undefined,
    author: row.author || undefined,
    description: row.description || undefined,
    averageRating: row.average_rating || undefined,
    pageCount: row.page_count || undefined,
    language: row.language || undefined,
    format: row.format || undefined,
    coverImage: row.cover_image || undefined,
    updatedAt: row.updated_at,
  };
}

function mapEditionRow(row: EditionRow): Edition {
  return {
    title: row.title,
    link: row.link,
    description: row.description || undefined,
    language: row.language || undefined,
    format: row.format || undefined,
    averageRating: row.average_rating || undefined,
    pages: row.pages_count || undefined,
    coverImage: row.cover_image || undefined,
    createdAt: row.created_at,
  };
}

export class DatabaseService {
  private readonly db: Database;

  constructor(filename = "library.sqlite") {
    this.db = new Database(filename, { create: true });
    this.init();
  }

  private init(): void {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA synchronous = NORMAL;");
    this.db.run("PRAGMA foreign_keys = ON;");
    this.db.run("PRAGMA cache_size = -64000;"); // 64MB cache

    // Schema version tracking
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const currentVersion = this.db
      .prepare("SELECT MAX(version) as v FROM schema_version")
      .get() as { v: number | null } | null;

    if (!currentVersion?.v) {
      this.db.run("INSERT OR IGNORE INTO schema_version (version) VALUES (1)");
    }

    // 0. Tabla de Sesiones (Cookies)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cookies TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 1. Tabla de Libros
    this.db.run(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        legacy_id TEXT,
        title TEXT,
        title_complete TEXT,
        author TEXT,
        description TEXT,
        average_rating REAL,
        page_count INTEGER,
        language TEXT,
        format TEXT,
        cover_image TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabla de Blogs
    this.db.run(`
      CREATE TABLE IF NOT EXISTS blogs (
        id TEXT PRIMARY KEY,
        url TEXT,
        title TEXT,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Tabla Intermedia
    this.db.run(`
      CREATE TABLE IF NOT EXISTS blog_books (
        blog_id TEXT,
        book_id TEXT,
        PRIMARY KEY (blog_id, book_id)
      );
    `);

    // 4. Tabla de Ediciones
    this.db.run(`
      CREATE TABLE IF NOT EXISTS editions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_legacy_id TEXT,
        title TEXT,
        link TEXT,
        description TEXT,
        language TEXT,
        format TEXT,
        average_rating REAL,
        pages_count INTEGER,
        cover_image TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.run("CREATE INDEX IF NOT EXISTS idx_editions_book ON editions(book_legacy_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_editions_lang ON editions(language);");

    // 5. Tabla de metadatos HTTP (ETag / Last-Modified)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS http_metadata (
        url_hash TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        etag TEXT,
        last_modified TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // --- MÉTODOS DE LECTURA ---

  public getDb(): Database {
    return this.db;
  }

  public getBook(id: string): Book | null {
    const query = this.db.prepare("SELECT * FROM books WHERE id = ?");
    const result = query.get(id);

    if (!isBookRow(result)) {
      return null;
    }

    return mapBookRow(result);
  }

  public getAllBooks(): Book[] {
    const query = this.db.prepare("SELECT * FROM books");
    const results = query.all();

    return (results as unknown[]).filter(isBookRow).map(mapBookRow);
  }

  public getAllBlogs(): Blog[] {
    const query = this.db.prepare("SELECT * FROM blogs");
    const results = query.all();

    return (results as unknown[]).filter(isBlogRow).map((row) => ({
      id: row.id,
      title: row.title,
      webUrl: row.url,
      createdAt: row.scraped_at,
    }));
  }

  public getEditions(legacyId: string | number, language?: string): Edition[] {
    let sql = "SELECT * FROM editions WHERE book_legacy_id = ?";
    const params: (string | number)[] = [String(legacyId)];

    if (language) {
      sql += " AND language = ?";
      params.push(language);
    }

    const query = this.db.prepare(sql);
    const results = query.all(...params);

    return (results as unknown[]).filter(isEditionRow).map(mapEditionRow);
  }

  public getLatestSession(): { cookies: string; createdAt: string } | null {
    const query = this.db.prepare(
      "SELECT cookies, created_at FROM sessions ORDER BY created_at DESC LIMIT 1",
    );
    const result = query.get();

    if (isSessionRow(result)) {
      return {
        cookies: result.cookies,
        createdAt: result.created_at,
      };
    }
    return null;
  }

  // --- MÉTODOS DE ESCRITURA ---

  public saveSession(cookies: string): void {
    const query = this.db.prepare("INSERT INTO sessions (cookies) VALUES (?)");
    query.run(cookies);
  }

  public saveBook(book: Book): void {
    const query = this.db.prepare(`
      INSERT INTO books (
        id, legacy_id, title, title_complete, author, description, 
        average_rating, page_count,
        language, format, cover_image, updated_at
      )
      VALUES (
        $id, $legacyId, $title, $titleComplete, $author, $description,
        $averageRating, $pageCount,
        $language, $format, $coverImage, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        legacy_id = excluded.legacy_id,
        title = excluded.title,
        average_rating = excluded.average_rating,
        updated_at = CURRENT_TIMESTAMP;
    `);

    query.run({
      $id: book.id,
      $legacyId: book.legacyId?.toString() || null,
      $title: book.title,
      $titleComplete: book.titleComplete || null,
      $author: book.author || null,
      $description: book.description || null,
      $averageRating: book.averageRating || null,
      $pageCount: book.pageCount || null,
      $language: book.language || null,
      $format: book.format || null,
      $coverImage: book.coverImage || null,
    });
  }

  public saveEditions(legacyId: string | number, editions: Edition[]): void {
    const insert = this.db.prepare(`
      INSERT INTO editions (
        book_legacy_id, title, link, description, 
        language, format, average_rating, pages_count, cover_image
      )
      VALUES (
        $legacyId, $title, $link, $description,
        $language, $format, $rating, $pages, $coverImage
      );
    `);

    const transaction = this.db.transaction((items: Edition[]) => {
      for (const ed of items) {
        insert.run({
          $legacyId: String(legacyId),
          $title: ed.title,
          $link: ed.link,
          $description: ed.description || null,
          $language: ed.language || null,
          $format: ed.format || null,
          $rating: ed.averageRating || 0,
          $pages: ed.pages || 0,
          $coverImage: ed.coverImage || null,
        });
      }
    });

    transaction(editions);
  }

  public deleteEditions(legacyId: string | number, language?: string): void {
    let sql = "DELETE FROM editions WHERE book_legacy_id = ?";
    const params: (string | number)[] = [String(legacyId)];

    if (language) {
      sql += " AND language = ?";
      params.push(language);
    }

    const query = this.db.prepare(sql);
    query.run(...params);
  }

  public saveBlogReference(params: {
    blogId: string;
    bookId: string;
    blogTitle?: string;
    blogUrl?: string;
  }): void {
    const { blogId, bookId, blogTitle, blogUrl } = params;

    const insertBlog = this.db.prepare(`
      INSERT INTO blogs (id, title, url) 
      VALUES ($id, $title, $url)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title;
    `);

    insertBlog.run({
      $id: blogId,
      $title: blogTitle || "Unknown Blog",
      $url: blogUrl || "",
    });

    const insertRel = this.db.prepare(`
      INSERT OR IGNORE INTO blog_books (blog_id, book_id) VALUES ($blogId, $bookId);
    `);

    insertRel.run({
      $blogId: blogId,
      $bookId: bookId,
    });
  }

  // --- HTTP METADATA (ETag / Last-Modified) ---

  public getHttpMetadata(
    urlHash: string,
  ): { etag?: string; lastModified?: string; updatedAt: string } | null {
    const row = this.db
      .prepare("SELECT etag, last_modified, updated_at FROM http_metadata WHERE url_hash = ?")
      .get(urlHash) as { etag?: string; last_modified?: string; updated_at: string } | null;

    if (!row) {
      return null;
    }

    return {
      etag: row.etag || undefined,
      lastModified: row.last_modified || undefined,
      updatedAt: row.updated_at,
    };
  }

  public saveHttpMetadata(
    urlHash: string,
    url: string,
    etag?: string,
    lastModified?: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO http_metadata (url_hash, url, etag, last_modified, updated_at)
         VALUES ($hash, $url, $etag, $lastModified, CURRENT_TIMESTAMP)
         ON CONFLICT(url_hash) DO UPDATE SET
           etag = excluded.etag,
           last_modified = excluded.last_modified,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run({
        $hash: urlHash,
        $url: url,
        $etag: etag || null,
        $lastModified: lastModified || null,
      });
  }

  public refreshHttpMetadata(urlHash: string): void {
    this.db
      .prepare("UPDATE http_metadata SET updated_at = CURRENT_TIMESTAMP WHERE url_hash = ?")
      .run(urlHash);
  }

  public refreshBookTimestamp(bookId: string): void {
    this.db.prepare("UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(bookId);
  }

  public close(): void {
    this.db.close();
  }
}
