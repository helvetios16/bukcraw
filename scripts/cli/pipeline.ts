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
  enableReport: boolean;
  checkOnly: boolean;
  force: boolean;
}

const _VALID_FORMATS = ["hardcover", "paperback", "ebook", "Kindle Edition", "audiobook"] as const;

interface PipelineError {
  id: string;
  title: string;
  error: string;
}

interface BlogRelationRow {
  book_id: string;
  blog_id: string;
  blog_title: string;
  blog_url: string;
}

// ── Args parsing ──

function parseArgs(): PipelineArgs | null {
  const args: string[] = process.argv.slice(2);
  const params: PipelineArgs = {
    blogIds: [],
    language: "spa",
    formats: ["ebook", "Kindle Edition"],
    sort: "num_ratings",
    output: "",
    enableReport: false,
    checkOnly: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return null;
    } else if (arg === "--report") {
      params.enableReport = true;
    } else if (arg === "--check-only") {
      params.checkOnly = true;
    } else if (arg === "--force") {
      params.force = true;
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
  bukcraw run [options] [blogId1 blogId2 ...]
  bukcraw check [options] [blogId1 blogId2 ...]

${c.heading("Options:")}
  --blogs=<id1,id2,...>  Blog IDs, comma-separated
  --language=<code>      Language code (default: ${c.info("spa")})
  --format=<fmt>         Book format(s), comma-separated
                         (default: ${c.info("ebook,Kindle Edition")})
  --sort=<order>         Edition sort order (default: ${c.info("num_ratings")})
  --report               Generate final report
  --force                Force full scrape (ignore format checks)
  --output=<path>        Output filename (default: auto-generated)
  --help, -h             Show this help
`);
}

// ── Blog scraping phase ──

async function scrapeBlog(
  service: GoodreadsService,
  blogId: string,
  language: string,
  formats: string[],
  sort: string,
  checkOnly: boolean,
  force: boolean,
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
        const filters = await service.scrapeEditionsFilters(bookDetails.legacyId);

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
            const filterOptions: BookFilterOptions = { language, sort, format };
            await service.scrapeFilteredEditions(bookDetails.legacyId, filterOptions);
          }
        }
      }

      processedBooks.push(bookDetails);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`  ${c.warn("Error:")} ${c.gray(errorMessage)}`);
      errors.push({ id: bookRef.id, title: bookRef.title || "Unknown", error: errorMessage });
    }
  }

  return { books: processedBooks, errors };
}

// ── Report generation phase ──

function generateReport(
  dbService: DatabaseService,
  targetBlogIds: string[],
  language: string,
): FinalReportOutput {
  const db = dbService.getDb();
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

  const allBooks = dbService.getAllBooks();
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

// ── Main ──

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args) {
    return;
  }

  const { blogIds, language, formats, sort, output, enableReport, checkOnly, force } = args;

  if (blogIds.length === 0) {
    console.error(c.error("Error: At least one blog ID is required."));
    process.exit(1);
  }

  console.log(
    `${c.heading(checkOnly ? "Check Mode" : "Pipeline Mode")} ${c.gray(`| ${blogIds.length} blog(s) | lang=${language} formats=${formats.join(",")}`)}`,
  );

  const browserClient = new BrowserClient();
  const dbService = new DatabaseService();
  const allErrors: PipelineError[] = [];

  try {
    const service = new GoodreadsService(browserClient);

    if (!checkOnly) {
      console.log(`\n${c.heading("=== Phase 1: Scraping blogs ===")}`);
    }

    for (const [i, blogId] of blogIds.entries()) {
      console.log(c.gray(`\n[${i + 1}/${blogIds.length}]`));
      const { errors } = await scrapeBlog(
        service,
        blogId,
        language,
        formats,
        sort,
        checkOnly,
        force,
      );
      for (const err of errors) {
        allErrors.push({ blogId, ...err });
      }
    }

    if (checkOnly) {
      console.log(`\n${c.success("Check completed.")}`);
      return;
    }

    service.printTelemetry();

    if (!enableReport) {
      console.log(`\n${c.gray("Final report generation is disabled (use --report to enable)")}`);
    } else {
      console.log(`\n${c.heading("=== Phase 2: Generating combined report ===")}`);
      const report = generateReport(dbService, blogIds, language);

      const { mkdirSync } = await import("node:fs");
      const path = await import("node:path");
      const reportsDir = path.resolve(process.cwd(), ".reports");
      mkdirSync(reportsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const finalPath = path.resolve(reportsDir, output || `report-pipeline-${timestamp}.json`);
      await Bun.write(finalPath, JSON.stringify(report, null, 2));

      console.log(`\n${c.heading("=== Results ===")}`);
      console.log(`  Unique books:          ${c.info(String(report.count))}`);
      console.log(`  Report:                ${c.gray(finalPath)}`);
    }

    if (allErrors.length > 0) {
      console.log(`\n${c.warn(`${allErrors.length} error(s) found during process.`)}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n${c.error("Fatal error:")} ${message}`);
  } finally {
    dbService.close();
    await browserClient.close();
  }
}

main();
