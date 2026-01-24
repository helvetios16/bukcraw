import { Database } from "bun:sqlite";
import type { Book, Edition } from "../types";

/**
 * Represents a raw row from the 'books' table in SQLite.
 * Fields matching SQLite behavior (NULL -> null).
 */
interface BookRow {
  id: string;
  legacy_id?: string;
  title: string;
  title_complete?: string;
  author?: string;
  description?: string;
  average_rating?: number;
  page_count?: number;
  publication_date?: string;
  publisher?: string;
  language?: string;
  format?: string;
  cover_image?: string;
  genres?: string; // JSON string
  series?: string; // JSON string
  updated_at: string;
}

/**
 * Represents a raw row from the 'editions' table in SQLite.
 */
interface EditionRow {
  id: number;
  book_legacy_id?: string;
  title: string;
  link: string;
  isbn?: string;
  isbn10?: string;
  asin?: string;
  language?: string;
  format?: string;
  average_rating?: number;
  ratings_count?: number;
  cover_image?: string;
  created_at: string;
}

export class DatabaseService {
  private readonly db: Database;

  constructor(filename = "library.sqlite") {
    this.db = new Database(filename, { create: true });
    this.init();
  }

  private init(): void {
    this.db.run("PRAGMA foreign_keys = ON;");

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
        publication_date TEXT,
        publisher TEXT,
        language TEXT,
        format TEXT,
        cover_image TEXT,
        genres TEXT,
        series TEXT,
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
        isbn TEXT,
        isbn10 TEXT,
        asin TEXT,
        language TEXT,
        format TEXT,
        average_rating REAL,
        ratings_count INTEGER,
        cover_image TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.run("CREATE INDEX IF NOT EXISTS idx_editions_book ON editions(book_legacy_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_editions_lang ON editions(language);");
  }

  // --- MÉTODOS DE LECTURA ---

  public getBook(id: string): Book | null {
    const query = this.db.prepare("SELECT * FROM books WHERE id = ?");
    // SQLite returns null for NULL fields, but our interface expects optional (undefined) or null
    // We cast to unknown first to avoid conflict with strict typing, then validate mapping
    const result = query.get(id) as unknown as BookRow | undefined;

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      legacyId: result.legacy_id ? Number(result.legacy_id) : undefined,
      title: result.title,
      titleComplete: result.title_complete || undefined,
      author: result.author || undefined,
      description: result.description || undefined,
      averageRating: result.average_rating || undefined,
      pageCount: result.page_count || undefined,
      publicationDate: result.publication_date || undefined,
      publisher: result.publisher || undefined,
      language: result.language || undefined,
      format: result.format || undefined,
      coverImage: result.cover_image || undefined,
      genres: result.genres ? JSON.parse(result.genres) : [],
      series: result.series ? JSON.parse(result.series) : [],
    };
  }

  public getEditions(legacyId: string | number, language?: string): Edition[] {
    let sql = "SELECT * FROM editions WHERE book_legacy_id = ?";
    const params: (string | number)[] = [String(legacyId)];

    if (language) {
      sql += " AND language = ?";
      params.push(language);
    }

    const query = this.db.prepare(sql);
    const results = query.all(...params) as unknown as EditionRow[];

    return results.map((row) => ({
      title: row.title,
      link: row.link,
      isbn: row.isbn || undefined,
      isbn10: row.isbn10 || undefined,
      asin: row.asin || undefined,
      language: row.language || undefined,
      format: row.format || undefined,
      averageRating: row.average_rating || undefined,
      ratingsCount: row.ratings_count || undefined,
      coverImage: row.cover_image || undefined,
    }));
  }

  // --- MÉTODOS DE ESCRITURA ---

  public saveBook(book: Book): void {
    const query = this.db.prepare(`
      INSERT INTO books (
        id, legacy_id, title, title_complete, author, description, 
        average_rating, page_count, publication_date, publisher, 
        language, format, cover_image, genres, series, updated_at
      )
      VALUES (
        $id, $legacyId, $title, $titleComplete, $author, $description,
        $averageRating, $pageCount, $publicationDate, $publisher,
        $language, $format, $coverImage, $genres, $series, CURRENT_TIMESTAMP
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
      $publicationDate: book.publicationDate || null,
      $publisher: book.publisher || null,
      $language: book.language || null,
      $format: book.format || null,
      $coverImage: book.coverImage || null,
      $genres: JSON.stringify(book.genres || []),
      $series: JSON.stringify(book.series || []),
    });
  }

  public saveEditions(legacyId: string | number, editions: Edition[]): void {
    const insert = this.db.prepare(`
      INSERT INTO editions (
        book_legacy_id, title, link, isbn, isbn10, asin, 
        language, format, average_rating, ratings_count, cover_image
      )
      VALUES (
        $legacyId, $title, $link, $isbn, $isbn10, $asin,
        $language, $format, $rating, $count, $coverImage
      );
    `);

    const transaction = this.db.transaction((items: Edition[]) => {
      for (const ed of items) {
        insert.run({
          $legacyId: String(legacyId),
          $title: ed.title,
          $link: ed.link,
          $isbn: ed.isbn || null,
          $isbn10: ed.isbn10 || null,
          $asin: ed.asin || null,
          $language: ed.language || null,
          $format: ed.format || null,
          $rating: ed.averageRating || 0,
          $count: ed.ratingsCount || 0,
          $coverImage: ed.coverImage || null,
        });
      }
    });

    transaction(editions);
  }

    public saveBlogReference(params: { blogId: string; bookId: string; blogTitle?: string; blogUrl?: string }): void {
      const { blogId, bookId, blogTitle, blogUrl } = params;
      
      const insertBlog = this.db.prepare(`
        INSERT INTO blogs (id, title, url) 
        VALUES ($id, $title, $url)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title;
      `);
      
      insertBlog.run({
        $id: blogId,
        $title: blogTitle || "Unknown Blog",
        $url: blogUrl || ""
      });
  
      const insertRel = this.db.prepare(`
        INSERT OR IGNORE INTO blog_books (blog_id, book_id) VALUES ($blogId, $bookId);
      `);
      
      insertRel.run({
        $blogId: blogId,
        $bookId: bookId
      });
    }
  public close(): void {
    this.db.close();
  }
}
