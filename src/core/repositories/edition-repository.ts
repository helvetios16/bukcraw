import type { Database, Statement } from "bun:sqlite";
import type { Edition } from "../../types";

interface EditionRow {
  title: string;
  link: string;
  description?: string;
  language?: string;
  format?: string;
  average_rating?: number;
  pages_count?: number;
  cover_image?: string;
  created_at: string;
}

export class EditionRepository {
  private readonly insertStmt: Statement;

  constructor(private readonly db: Database) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO editions (
        book_legacy_id, title, link, description, 
        language, format, average_rating, pages_count, cover_image
      )
      VALUES (
        $legacyId, $title, $link, $description,
        $language, $format, $rating, $pages, $coverImage
      );
    `);
  }

  public saveMany(legacyId: string | number, editions: Edition[]): void {
    const transaction = this.db.transaction((items: Edition[]) => {
      for (const ed of items) {
        this.insertStmt.run({
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

  public getByLegacyId(legacyId: string | number, language?: string): Edition[] {
    let sql = "SELECT * FROM editions WHERE book_legacy_id = ?";
    const params: (string | number)[] = [String(legacyId)];

    if (language) {
      sql += " AND language = ?";
      params.push(language);
    }

    const rows = this.db.prepare(sql).all(...params) as EditionRow[];
    return rows.map((row) => this.mapRow(row));
  }

  public deleteByLegacyId(legacyId: string | number, language?: string): void {
    let sql = "DELETE FROM editions WHERE book_legacy_id = ?";
    const params: (string | number)[] = [String(legacyId)];

    if (language) {
      sql += " AND language = ?";
      params.push(language);
    }

    this.db.prepare(sql).run(...params);
  }

  private mapRow(row: EditionRow): Edition {
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
}
