#!/usr/bin/env bun
import { BrowserClient } from "../../src/core/browser-client";
import { DatabaseService } from "../../src/core/database";
import { GoodreadsService } from "../../src/services/goodreads-service";
import type { Book, BookFilterOptions, Edition } from "../../src/types";
import { ansi } from "../../src/utils/logger";
import { Progress } from "../../src/utils/progress";

const c = ansi;

// ── Types ──

interface BookReport extends Book {
  editionsFound: Edition[];
  blogs: { id: string; title: string; url: string }[];
}

interface FinalReportOutput {
  generatedAt: string;
  count: number;
  blogs: { id: string; title: string; url: string }[];
  books: BookReport[];
}

interface PipelineArgs {
  blogIds: string[];
  language: string;
  formats: string[];
  sort: string;
  output: string;
  skipReport: boolean;
}

const VALID_FORMATS = ["hardcover", "paperback", "ebook", "Kindle Edition", "audiobook"] as const;
type ValidFormat = (typeof VALID_FORMATS)[number];

// ── Args parsing ──

function parseArgs(): PipelineArgs | null {
  const args: string[] = process.argv.slice(2);
  const params: PipelineArgs = {
    blogIds: [],
    language: "spa",
    formats: ["ebook", "Kindle Edition"],
    sort: "num_ratings",
    output: "",
    skipReport: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return null;
    } else if (arg === "--no-report") {
      params.skipReport = true;
    } else if (arg.startsWith("--blogs=")) {
      const value = arg.split("=").slice(1).join("=");
      params.blogIds = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--language=")) {
      params.language = arg.split("=")[1] ?? "spa";
    } else if (arg.startsWith("--format=")) {
      const formatValue = arg.split("=")[1] ?? "";
      params.formats = formatValue
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--sort=")) {
      params.sort = arg.split("=")[1] ?? "num_ratings";
    } else if (arg.startsWith("--output=")) {
      params.output = arg.split("=").slice(1).join("=");
    } else if (!arg.startsWith("--")) {
      // Positional args are blog IDs
      params.blogIds.push(arg);
    }
  }

  return params;
}

function printHelp(): void {
  console.log(`
${c.heading("Pipeline: Blog → Books → Editions → Report")}

Scrapes multiple blogs, extracts books and editions, and generates
a combined report showing which books appear across multiple blogs.

${c.heading("Usage:")}
  bun run scripts/cli/pipeline.ts [options] [blogId1 blogId2 ...]

${c.heading("Options:")}
  --blogs=<id1,id2,...>  Blog IDs, comma-separated
  --language=<code>      Language code (default: ${c.info("spa")})
                         Examples: spa, eng, por, ita, fra, deu
  --format=<fmt>         Book format(s), comma-separated
                         (default: ${c.info("ebook,Kindle Edition")})
                         Valid: ${VALID_FORMATS.join(", ")}
  --sort=<order>         Edition sort order (default: ${c.info("num_ratings")})
                         Options: num_ratings, avg_rating, publish_date
  --no-report            Skip report generation (scrape only)
  --output=<path>        Output filename (default: auto-generated)
  --help, -h             Show this help

${c.heading("Examples:")}
  bun run scripts/cli/pipeline.ts blog-id-1 blog-id-2
  bun run scripts/cli/pipeline.ts --blogs=blog-1,blog-2,blog-3
  bun run scripts/cli/pipeline.ts --blogs=blog-1,blog-2 --language=eng --format=ebook
`);
}

// ── Blog scraping phase ──

async function scrapeBlog(
  service: GoodreadsService,
  blogId: string,
  language: string,
  formats: string[],
  sort: string,
): Promise<{ books: Book[]; errors: { id: string; title: string; error: string }[] }> {
  const blogData = await service.scrapeBlog(blogId);
  if (!blogData) {
    console.error(c.error(`  Failed to scrape blog ${blogId}`));
    return { books: [], errors: [] };
  }

  console.log(`\n${c.heading(`Blog: ${blogData.title || blogId}`)}`);

  const books: Book[] = blogData.mentionedBooks || [];
  console.log(c.success(`  ${books.length} books found`));

  const progress = new Progress(books.length);
  const processedBooks: Book[] = [];
  const errors: { id: string; title: string; error: string }[] = [];

  for (const bookRef of books) {
    progress.tick(bookRef.title || bookRef.id);

    try {
      const bookDetails = await service.scrapeBook(bookRef.id);
      if (!bookDetails) {
        throw new Error(`Failed to get details for book ${bookRef.id}`);
      }

      if (bookDetails.legacyId) {
        await service.scrapeEditionsFilters(bookDetails.legacyId);

        const formatsToProcess = formats.length > 0 ? formats : [undefined];
        for (const format of formatsToProcess) {
          const filterOptions: BookFilterOptions = { language, sort, format };
          await service.scrapeFilteredEditions(bookDetails.legacyId, filterOptions);
        }
      }

      processedBooks.push(bookDetails);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`  ${c.warn("Skipped:")} ${c.gray(errorMessage)}`);
      errors.push({ id: bookRef.id, title: bookRef.title || "Unknown", error: errorMessage });
    }
  }

  return { books: processedBooks, errors };
}

// ── Report generation phase (from DB, same logic as report-books-relations) ──

function generateReport(
  dbService: DatabaseService,
  targetBlogIds: string[],
  language: string,
): FinalReportOutput {
  const db = dbService.getDb();
  const booksByCanonicalKey = new Map<string, BookReport>();

  // Fetch blog-book relations
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

  const allBlogRelations = db.prepare(querySql).all(...queryParams) as {
    book_id: string;
    blog_id: string;
    blog_title: string;
    blog_url: string;
  }[];

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

  // Process books with deduplication
  const allBooks = dbService.getAllBooks();
  const filteredBooks =
    targetBlogIds.length > 0
      ? allBooks.filter((b) => {
          const normalizedId = b.id.match(/^\d+/)?.[0] || b.id;
          return blogsByBookId.has(normalizedId);
        })
      : allBooks;

  for (const book of filteredBooks) {
    const canonicalTitle = book.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

    const canonicalAuthor = (book.author || "Unknown")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

    const canonicalKey = `${canonicalTitle}-${canonicalAuthor}`;
    const normalizedBookId = book.id.match(/^\d+/)?.[0] || book.id;
    const relatedBlogs = blogsByBookId.get(normalizedBookId) || [];

    let editions: Edition[] = [];
    if (book.legacyId) {
      editions = dbService.getEditions(book.legacyId, language || undefined);
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
      if (!existing.description && book.description) {
        existing.description = book.description;
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

  // Collect unique blogs
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

// ── Main ──

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args) {
    return;
  }

  const { blogIds, language, formats, sort, output, skipReport } = args;

  if (blogIds.length === 0) {
    console.error(c.error("Error: At least one blog ID is required."));
    console.log(c.gray("Run with --help for usage information."));
    process.exit(1);
  }

  const invalidFormats = formats.filter((f) => !VALID_FORMATS.includes(f as ValidFormat));
  if (invalidFormats.length > 0) {
    console.error(
      c.error(
        `Error: Invalid format(s) '${invalidFormats.join(", ")}'. Valid: ${VALID_FORMATS.join(", ")}`,
      ),
    );
    process.exit(1);
  }

  console.log(
    `${c.heading("Pipeline")} ${c.gray(`| ${blogIds.length} blog(s) | lang=${language} format=${formats.join(",") || "any"} sort=${sort}`)}`,
  );
  console.log(
    `  Report:   ${skipReport ? c.warn("disabled (--no-report)") : c.success("enabled")}`,
  );

  const browserClient = new BrowserClient();
  const dbService = new DatabaseService();
  const allErrors: { blogId: string; id: string; title: string; error: string }[] = [];

  try {
    const service = new GoodreadsService(browserClient);

    // ── Phase 1: Scrape all blogs ──
    console.log(`\n${c.heading("=== Phase 1: Scraping blogs ===")}`);

    for (const [i, blogId] of blogIds.entries()) {
      console.log(c.gray(`\n[${i + 1}/${blogIds.length}]`));
      const { errors } = await scrapeBlog(service, blogId, language, formats, sort);
      for (const err of errors) {
        allErrors.push({ blogId, ...err });
      }
    }

    service.printTelemetry();

    // ── Phase 2: Generate combined report ──
    if (skipReport) {
      console.log(`\n${c.gray("Skipping report generation (--no-report)")}`);
    } else {
      console.log(`\n${c.heading("=== Phase 2: Generating combined report ===")}`);

      const report = generateReport(dbService, blogIds, language);

      // Stats
      const withEditions = report.books.filter((b) => b.editionsFound.length > 0).length;
      const multiBlog = report.books.filter((b) => b.blogs.length > 1).length;

      // Save report
      const { mkdirSync } = await import("node:fs");
      const path = await import("node:path");

      const reportsDir = path.resolve(process.cwd(), ".reports");
      mkdirSync(reportsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outputName = output || `report-pipeline-${timestamp}.json`;
      const finalPath = path.resolve(reportsDir, outputName);

      await Bun.write(finalPath, JSON.stringify(report, null, 2));

      // Summary
      console.log(`\n${c.heading("=== Results ===")}`);
      console.log(`  Blogs scraped:         ${c.info(String(report.blogs.length))}`);
      console.log(`  Unique books:          ${c.info(String(report.count))}`);
      console.log(`  With editions:         ${c.success(String(withEditions))}`);
      console.log(`  In multiple blogs:     ${c.success(String(multiBlog))}`);
      console.log(`  Report:                ${c.gray(finalPath)}`);

      if (multiBlog > 0) {
        console.log(`\n${c.heading("Books in multiple blogs (best picks):")}`);
        const multiBlogBooks = report.books
          .filter((b) => b.blogs.length > 1)
          .sort((a, b) => b.blogs.length - a.blogs.length);

        for (const book of multiBlogBooks) {
          const edCount = book.editionsFound.length;
          const blogNames = book.blogs.map((b) => b.title).join(", ");
          const edInfo = edCount > 0 ? c.success(`${edCount} ed.`) : c.warn("no editions");
          console.log(`  ${c.info(`[${book.blogs.length} blogs]`)} ${book.title} — ${edInfo}`);
          console.log(`    ${c.gray(blogNames)}`);
        }
      }
    }

    if (allErrors.length > 0) {
      console.log(`\n${c.warn(`${allErrors.length} error(s):`)}`);
      const grouped = Map.groupBy(allErrors, (err) => err.error);
      for (const [reason, items] of grouped) {
        console.log(`\n  ${c.gray(reason)} ${c.warn(`(${items.length})`)}`);
        for (const err of items) {
          console.log(`    ${c.gray("-")} ${err.title}`);
        }
      }
    }
  } catch (error: unknown) {
    const fatalMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n${c.error("Fatal error:")} ${fatalMessage}`);
  } finally {
    dbService.close();
    await browserClient.close();
  }
}

main();
