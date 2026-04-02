/**
 * @file index.ts
 * @description Main entry point for testing the Goodreads scraping application with Database integration.
 */

import { BrowserClient } from "./src/core/browser-client";
import { GoodreadsService } from "./src/services/goodreads-service";
import { getErrorMessage } from "./src/utils/util";

const ansi = (color: string) => Bun.color(color, "ansi-16m") ?? "";
const c = {
  heading: ansi("#7ec8e3"),
  success: ansi("#81c784"),
  warn: ansi("#ffb74d"),
  error: ansi("#e57373"),
  dim: ansi("#9e9e9e"),
  reset: "\x1b[0m",
};

async function main(): Promise<void> {
  const browserClient = new BrowserClient();
  try {
    const blogId = "3046-8-new-books-recommended-by-readers-this-week";

    const goodreadsService = new GoodreadsService(browserClient);

    console.log(`${c.heading}--- 1. Scraping blog ---${c.reset}`);
    const blog = await goodreadsService.scrapeBlog(blogId);

    const books = blog?.mentionedBooks ?? [];
    if (books.length === 0) {
      console.log(`${c.warn}No books found in blog.${c.reset}`);
      return;
    }

    console.log(`\n${c.heading}--- 2. Scraping ${books.length} books from blog ---${c.reset}`);
    for (const mentionedBook of books) {
      try {
        const book = await goodreadsService.scrapeBook(mentionedBook.id);
        if (!book?.legacyId) {
          continue;
        }

        console.log(`  ${c.success}${book.title}${c.reset} ${c.dim}(${book.pageCount ?? "?"} pages)${c.reset}`);

        await goodreadsService.scrapeEditionsFilters(book.legacyId);

        for (const format of ["Kindle Edition", "ebook"]) {
          await goodreadsService.scrapeFilteredEditions(book.legacyId, {
            language: "spa",
            format,
          });
        }
      } catch (error: unknown) {
        console.warn(`  ${c.warn}Skipped${c.reset} ${mentionedBook.id}: ${c.dim}${getErrorMessage(error)}${c.reset}`);
      }
    }
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error(`${c.error}Scraping error:${c.reset} ${message}`);
  } finally {
    await browserClient.close();
  }
}

main().catch(console.error);
