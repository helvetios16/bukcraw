import type { DatabaseService } from "../core/database";
import type { Book, BookFilterOptions, Edition } from "../types";
import { ansi } from "../utils/logger";
import { Progress } from "../utils/progress";
import type { GoodreadsService } from "./goodreads-service";

const c = ansi;

export interface PipelineOptions {
  language: string;
  formats: string[];
  sort: string;
  checkOnly?: boolean;
  force?: boolean;
}

export interface PipelineResult {
  books: Book[];
  errors: PipelineError[];
}

export interface PipelineError {
  blogId?: string;
  id: string;
  title: string;
  error: string;
}

export interface BookReport extends Book {
  editionsFound: Edition[];
  blogs: { id: string; title: string; url: string }[];
}

export interface FinalReportOutput {
  generatedAt: string;
  count: number;
  blogs: { id: string; title: string; url: string }[];
  books: BookReport[];
}

export class PipelineService {
  constructor(
    private readonly service: GoodreadsService,
    private readonly dbService: DatabaseService,
  ) {}

  /**
   * Ejecuta el proceso de scraping para un blog.
   */
  public async processBlog(blogId: string, options: PipelineOptions): Promise<PipelineResult> {
    const { language, formats, sort, checkOnly = false, force = false } = options;

    const blogData = await this.service.scrapeBlog(blogId);
    if (!blogData) {
      return {
        books: [],
        errors: [{ id: blogId, title: "Unknown", error: "Failed to scrape blog" }],
      };
    }

    console.log(`\n${c.heading(`Blog: ${blogData.title || blogId}`)}`);

    const books: Book[] = blogData.mentionedBooks || [];
    console.log(c.success(`  ${books.length} books found`));

    const progress = new Progress(books.length);
    const processedBooks: Book[] = [];
    const errors: PipelineError[] = [];

    for (const bookRef of books) {
      progress.tick(bookRef.title || bookRef.id);

      try {
        const bookDetails = await this.service.scrapeBook(bookRef.id);
        if (!bookDetails) {
          throw new Error(`Failed to get details for book ${bookRef.id}`);
        }

        if (bookDetails.legacyId) {
          const filters = await this.service.scrapeEditionsFilters(bookDetails.legacyId);

          if (filters && !force) {
            const hasLanguage = filters.language.some((l) => l.value === language);
            const availableFormats =
              formats.length > 0
                ? formats.filter((f) => filters.format.some((af) => af.value === f))
                : [];

            const canProcess = hasLanguage && (formats.length === 0 || availableFormats.length > 0);

            if (!canProcess) {
              const reason = !hasLanguage
                ? `Language '${language}' not found`
                : `Format(s) '${formats.join(",")}' not found`;
              console.log(`  ${c.warn("Skipped:")} ${c.gray(reason)}`);
              continue;
            }

            if (checkOnly) {
              console.log(
                `  ${c.success("Available:")} ${c.gray(`${language} | ${availableFormats.join(",")}`)}`,
              );
              processedBooks.push(bookDetails);
              continue;
            }
          }

          if (!checkOnly) {
            const formatsToProcess = formats.length > 0 ? formats : [undefined];
            for (const format of formatsToProcess) {
              const filterOptions: BookFilterOptions = {
                language,
                sort,
                format,
              };
              await this.service.scrapeFilteredEditions(bookDetails.legacyId, filterOptions);
            }
          }
        }

        processedBooks.push(bookDetails);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn(`  ${c.warn("Error:")} ${c.gray(errorMessage)}`);
        errors.push({
          id: bookRef.id,
          title: bookRef.title || "Unknown",
          error: errorMessage,
        });
      }
    }

    return { books: processedBooks, errors };
  }

  /**
   * Genera el reporte combinado basado en los blogs procesados.
   */
  public generateReport(targetBlogIds: string[], language: string): FinalReportOutput {
    const db = this.dbService.getDb();
    const booksByCanonicalKey = new Map<string, BookReport>();

    let querySql = `
      SELECT bb.book_id, b.id as blog_id, b.title as blog_title, b.url as blog_url
      FROM blog_books bb
      JOIN blogs b ON bb.blog_id = b.id
    `;

    const queryParams: string[] = [];
    if (targetBlogIds.length > 0) {
      const placeholders = targetBlogIds.map(() => "?").join(",");
      querySql += ` WHERE b.id IN (${placeholders})`;
      queryParams.push(...targetBlogIds);
    }

    type BlogRelationRow = {
      book_id: string;
      blog_id: string;
      blog_title: string;
      blog_url: string;
    };

    const allBlogRelations = db.prepare(querySql).all(...queryParams) as BlogRelationRow[];

    const blogsByBookId = new Map<string, { id: string; title: string; url: string }[]>();
    for (const rel of allBlogRelations) {
      const normalizedBookId = rel.book_id.match(/^\d+/)?.[0] || rel.book_id;
      if (!blogsByBookId.has(normalizedBookId)) {
        blogsByBookId.set(normalizedBookId, []);
      }
      blogsByBookId.get(normalizedBookId)?.push({
        id: rel.blog_id,
        title: rel.blog_title,
        url: rel.blog_url,
      });
    }

    const allBooks = this.dbService.getAllBooks();
    const filteredBooks =
      targetBlogIds.length > 0
        ? allBooks.filter((b) => {
            const normalizedId = b.id.match(/^\d+/)?.[0] || b.id;
            return blogsByBookId.has(normalizedId);
          })
        : allBooks;

    for (const book of filteredBooks) {
      const canonicalKey = `${book.title}-${book.author}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedBookId = book.id.match(/^\d+/)?.[0] || book.id;
      const relatedBlogs = blogsByBookId.get(normalizedBookId) || [];

      let editions: Edition[] = [];
      if (book.legacyId) {
        editions = this.dbService.getEditions(book.legacyId, language || undefined);
      }

      const existing = booksByCanonicalKey.get(canonicalKey);
      if (existing) {
        for (const blog of relatedBlogs) {
          if (!existing.blogs.some((b) => b.id === blog.id)) {
            existing.blogs.push(blog);
          }
        }
        for (const edition of editions) {
          if (!existing.editionsFound.some((e) => e.link === edition.link)) {
            existing.editionsFound.push(edition);
          }
        }
      } else {
        booksByCanonicalKey.set(canonicalKey, {
          ...book,
          blogs: relatedBlogs,
          editionsFound: editions,
        });
      }
    }

    const finalBooks = Array.from(booksByCanonicalKey.values());
    const blogsInReport = new Map<string, { id: string; title: string; url: string }>();
    for (const book of finalBooks) {
      for (const blog of book.blogs) {
        if (!blogsInReport.has(blog.id)) {
          blogsInReport.set(blog.id, blog);
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      count: finalBooks.length,
      blogs: Array.from(blogsInReport.values()).sort((a, b) => a.title.localeCompare(b.title)),
      books: finalBooks,
    };
  }
}
