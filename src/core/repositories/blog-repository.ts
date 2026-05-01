import type { Database, Statement } from "bun:sqlite";
import type { Blog } from "../../types";

interface BlogRow {
  id: string;
  url: string;
  title: string;
  scraped_at: string;
}

export class BlogRepository {
  private readonly saveBlogStmt: Statement;
  private readonly saveRelStmt: Statement;
  private readonly getAllStmt: Statement;

  constructor(private readonly db: Database) {
    this.saveBlogStmt = this.db.prepare(`
      INSERT INTO blogs (id, title, url) 
      VALUES ($id, $title, $url)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title;
    `);

    this.saveRelStmt = this.db.prepare(`
      INSERT OR IGNORE INTO blog_books (blog_id, book_id) VALUES ($blogId, $bookId);
    `);

    this.getAllStmt = this.db.prepare("SELECT * FROM blogs");
  }

  public saveReference(params: {
    blogId: string;
    bookId: string;
    blogTitle?: string;
    blogUrl?: string;
  }): void {
    const { blogId, bookId, blogTitle, blogUrl } = params;

    this.saveBlogStmt.run({
      $id: blogId,
      $title: blogTitle || "Unknown Blog",
      $url: blogUrl || "",
    });

    this.saveRelStmt.run({
      $blogId: blogId,
      $bookId: bookId,
    });
  }

  public getAll(): Blog[] {
    const rows = this.getAllStmt.all() as BlogRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      webUrl: row.url,
      createdAt: row.scraped_at,
    }));
  }
}
