/**
 * @file index.ts
 * @description Main entry point for testing the Goodreads scraping application with Database integration.
 */

import { BrowserClient } from "./src/core/browser-client";
import { GoodreadsService } from "./src/services/goodreads-service";
import { pMap } from "./src/utils/concurrency";
import { ansi } from "./src/utils/logger";
import { getErrorMessage } from "./src/utils/util";

async function main(): Promise<void> {
  const browserClient = new BrowserClient();
  try {
    const blogId = "3046-8-new-books-recommended-by-readers-this-week";

    const goodreadsService = new GoodreadsService(browserClient);

    console.log(ansi.heading("--- 1. Scraping blog ---"));
    const blog = await goodreadsService.scrapeBlog(blogId);

    const books = blog?.mentionedBooks ?? [];
    if (books.length === 0) {
      console.log(ansi.warn("No books found in blog."));
      return;
    }

    console.log(`\n${ansi.heading(`--- 2. Scraping ${books.length} books from blog ---`)}`);
    await pMap(books, async (mentionedBook, index) => {
      try {
        const book = await goodreadsService.scrapeBook(mentionedBook.id);
        if (!book?.legacyId) {
          return;
        }

        console.log(
          `  ${ansi.info(`[${index + 1}/${books.length}]`)} ${ansi.success(book.title)} ${ansi.gray(`(${book.pageCount ?? "?"} pages)`)}`,
        );

        await goodreadsService.scrapeEditionsFilters(book.legacyId);

        for (const format of ["Kindle Edition", "ebook"]) {
          await goodreadsService.scrapeFilteredEditions(book.legacyId, {
            language: "spa",
            format,
          });
        }
      } catch (error: unknown) {
        console.warn(
          `  ${ansi.warn("Skipped")} ${mentionedBook.id}: ${ansi.gray(getErrorMessage(error))}`,
        );
      }
    }, 2);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error(`${ansi.error("Scraping error:")} ${message}`);
  } finally {
    await browserClient.close();
  }
}

main().catch(console.error);
