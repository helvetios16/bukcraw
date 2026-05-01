import type { Database, Statement } from "bun:sqlite";

interface SessionRow {
  cookies: string;
  created_at: string;
}

export class SessionRepository {
  private readonly saveStmt: Statement;
  private readonly getLatestStmt: Statement;

  constructor(private readonly db: Database) {
    this.saveStmt = this.db.prepare("INSERT INTO sessions (cookies) VALUES (?)");
    this.getLatestStmt = this.db.prepare(
      "SELECT cookies, created_at FROM sessions ORDER BY created_at DESC LIMIT 1",
    );
  }

  public save(cookies: string): void {
    this.saveStmt.run(cookies);
  }

  public getLatest(): { cookies: string; createdAt: string } | null {
    const row = this.getLatestStmt.get() as SessionRow | null;
    return row ? { cookies: row.cookies, createdAt: row.created_at } : null;
  }
}
