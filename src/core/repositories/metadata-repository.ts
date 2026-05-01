import type { Database, Statement } from "bun:sqlite";

interface MetadataRow {
  etag?: string;
  last_modified?: string;
  updated_at: string;
}

export class MetadataRepository {
  private readonly getStmt: Statement;
  private readonly saveStmt: Statement;
  private readonly refreshStmt: Statement;

  constructor(private readonly db: Database) {
    this.getStmt = this.db.prepare(
      "SELECT etag, last_modified, updated_at FROM http_metadata WHERE url_hash = ?",
    );
    this.saveStmt = this.db.prepare(`
      INSERT INTO http_metadata (url_hash, url, etag, last_modified, updated_at)
      VALUES ($hash, $url, $etag, $lastModified, CURRENT_TIMESTAMP)
      ON CONFLICT(url_hash) DO UPDATE SET
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        updated_at = CURRENT_TIMESTAMP
    `);
    this.refreshStmt = this.db.prepare(
      "UPDATE http_metadata SET updated_at = CURRENT_TIMESTAMP WHERE url_hash = ?",
    );
  }

  public getByHash(
    urlHash: string,
  ): { etag?: string; lastModified?: string; updatedAt: string } | null {
    const row = this.getStmt.get(urlHash) as MetadataRow | null;
    if (!row) {
      return null;
    }
    return {
      etag: row.etag || undefined,
      lastModified: row.last_modified || undefined,
      updatedAt: row.updated_at,
    };
  }

  public save(urlHash: string, url: string, etag?: string, lastModified?: string): void {
    this.saveStmt.run({
      $hash: urlHash,
      $url: url,
      $etag: etag || null,
      $lastModified: lastModified || null,
    });
  }

  public refresh(urlHash: string): void {
    this.refreshStmt.run(urlHash);
  }
}
