import { BrowserClient } from "../src/core/browser-client";
import { GoodreadsService } from "../src/services/goodreads-service";
import type { Book, BookFilterOptions, Edition } from "../src/types";

const ansi = (color: string) => Bun.color(color, "ansi-16m") ?? "";
const c = {
  heading: ansi("#7ec8e3"),
  success: ansi("#81c784"),
  warn: ansi("#ffb74d"),
  error: ansi("#e57373"),
  dim: ansi("#9e9e9e"),
  reset: "\x1b[0m",
};

/**
 * Interface for the final book report item.
 */
interface BookReport extends Book {
  editionsFound: Edition[];
  processingError?: string;
  sourceBlogId: string;
}

/**
 * Interface for parsed command line arguments.
 */
interface WorkflowArgs {
  blogId: string;
  language: string;
  formats: string[];
  sort: string;
}

const VALID_FORMATS = ["hardcover", "paperback", "ebook", "Kindle Edition", "audiobook"] as const;
type ValidFormat = (typeof VALID_FORMATS)[number];

/**
 * Parses command line arguments for the workflow.
 * @returns {WorkflowArgs | null} The parsed arguments or null if --help was shown.
 */
function parseArgs(): WorkflowArgs | null {
  const args: string[] = process.argv.slice(2);
  const params: WorkflowArgs = {
    blogId: "",
    language: "spa",
    formats: ["ebook", "Kindle Edition"],
    sort: "num_ratings",
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return null;
    } else if (arg.startsWith("--blogId=")) {
      params.blogId = arg.split("=")[1] ?? "";
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
    } else if (!arg.startsWith("--") && !params.blogId) {
      params.blogId = arg;
    }
  }

  return params;
}

function printHelp(): void {
  console.log(`
Usage: bun run workflow-blog-to-editions.ts [options]

Options:
  --blogId=<id>       Goodreads blog ID (required)
  --language=<code>   Language code (default: spa)
                      Examples: spa, eng, por, ita, fra, deu
  --format=<fmt>      Book format(s), comma-separated (optional)
                      Valid: ${VALID_FORMATS.join(", ")}
  --sort=<order>      Edition sort order (default: num_ratings)
                      Options: num_ratings, avg_rating, publish_date
  --help, -h          Show this help

Examples:
  bun run workflow-blog-to-editions.ts --blogId=12345
  bun run workflow-blog-to-editions.ts 12345
  bun run workflow-blog-to-editions.ts --blogId=12345 --language=eng --format=ebook
  bun run workflow-blog-to-editions.ts --blogId=12345 --format=ebook,Kindle Edition
`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (!args) {
    return;
  }

  const { blogId, language, formats, sort } = args;

  if (!blogId) {
    console.error(`${c.error}Error: Blog ID is required.${c.reset}`);
    process.exit(1);
  }

  const invalidFormats = formats.filter((f) => !VALID_FORMATS.includes(f as ValidFormat));
  if (invalidFormats.length > 0) {
    console.error(
      `${c.error}Error: Invalid format(s) '${invalidFormats.join(", ")}'. Valid: ${VALID_FORMATS.join(", ")}${c.reset}`,
    );
    process.exit(1);
  }

  console.log(`${c.heading}Blog ${blogId}${c.reset} ${c.dim}| lang=${language} format=${formats.join(",") || "any"} sort=${sort}${c.reset}`);

  const browserClient = new BrowserClient();
  const finalReport: BookReport[] = [];
  const errors: { id: string; title: string; error: string }[] = [];

  try {
    const service = new GoodreadsService(browserClient);

    console.log(`\n${c.heading}--- 1. Scraping blog ---${c.reset}`);
    const blogData = await service.scrapeBlog(blogId);

    if (!blogData) {
      throw new Error("Failed to retrieve blog data.");
    }

    const books: (Book & { section?: string })[] = blogData.mentionedBooks || [];

    console.log(`${c.success}${books.length} books found.${c.reset}`);

    console.log(`\n${c.heading}--- 2. Processing books ---${c.reset}`);

    for (const [index, bookRef] of books.entries()) {
      console.log(`\n${c.dim}[${index + 1}/${books.length}]${c.reset} ${bookRef.title || bookRef.id}`);

      const bookReportItem: BookReport = {
        ...bookRef,
        sourceBlogId: blogId,
        editionsFound: [],
      };

      try {
        const bookDetails = await service.scrapeBook(bookRef.id);

        if (!bookDetails) {
          throw new Error(`Failed to get details for book ${bookRef.id}`);
        }

        Object.assign(bookReportItem, bookDetails);

        if (!bookDetails.legacyId) {
          throw new Error("Legacy ID (Work ID) not found");
        }

        const legacyId = bookDetails.legacyId;

        await service.scrapeEditionsFilters(legacyId);

        const formatsToProcess = formats.length > 0 ? formats : [undefined];
        const allEditions: Edition[] = [];

        for (const format of formatsToProcess) {
          const filterOptions: BookFilterOptions = { language, sort, format };
          const editions = await service.scrapeFilteredEditions(legacyId, filterOptions);
          allEditions.push(...editions);
        }

        const seen = new Set<string>();
        const uniqueEditions = allEditions.filter((e) => {
          if (seen.has(e.link)) return false;
          seen.add(e.link);
          return true;
        });

        bookReportItem.editionsFound = uniqueEditions;
        console.log(`  ${c.success}${uniqueEditions.length} editions found.${c.reset}`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn(`  ${c.warn}Skipped:${c.reset} ${c.dim}${errorMessage}${c.reset}`);
        bookReportItem.processingError = errorMessage;
        errors.push({
          id: bookRef.id,
          title: bookRef.title || "Unknown",
          error: errorMessage,
        });
      } finally {
        finalReport.push(bookReportItem);
      }
    }

    console.log(`\n${c.heading}--- 3. Saving report ---${c.reset}`);
    const reportFilename = `report-${blogId}-${language}.json`;

    const fs = await import("node:fs");
    const path = await import("node:path");
    const finalPath = path.resolve(process.cwd(), reportFilename);

    fs.writeFileSync(finalPath, JSON.stringify(finalReport, null, 2));

    const withEditions = finalReport.filter((b) => b.editionsFound.length > 0).length;
    console.log(`${c.success}Done.${c.reset} ${withEditions}/${finalReport.length} books with editions. ${c.dim}${finalPath}${c.reset}`);

    if (errors.length > 0) {
      console.log(`\n${c.warn}${errors.length} error(s):${c.reset}`);
      const grouped = Map.groupBy(errors, (err) => err.error);
      for (const [reason, items] of grouped) {
        console.log(`\n  ${c.dim}${reason}${c.reset} ${c.warn}(${items.length})${c.reset}`);
        for (const err of items) {
          console.log(`    ${c.dim}-${c.reset} ${err.title}`);
        }
      }
    }
  } catch (error: unknown) {
    const fatalMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n${c.error}Fatal error:${c.reset} ${fatalMessage}`);
  } finally {
    await browserClient.close();
  }
}

main();
