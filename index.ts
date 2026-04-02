/**
 * @file index.ts
 * @description Main entry point for testing the Goodreads scraping application with Database integration.
 */

import { BrowserClient } from "./src/core/browser-client";
import { GoodreadsService } from "./src/services/goodreads-service";
import { getErrorMessage } from "./src/utils/util";

async function main(): Promise<void> {
  const browserClient = new BrowserClient();
  try {
    const blogId = "3046-8-new-books-recommended-by-readers-this-week";

    const goodreadsService = new GoodreadsService(browserClient);

    console.log("--- 1. Scraping blog ---");
    const blog = await goodreadsService.scrapeBlog(blogId);

    const books = blog?.mentionedBooks ?? [];
    if (books.length === 0) {
      console.log("No books found in blog.");
      return;
    }

    console.log(`\n--- 2. Scraping ${books.length} books from blog ---`);
    for (const mentionedBook of books) {
      const book = await goodreadsService.scrapeBook(mentionedBook.id);
      if (!book?.legacyId) {
        continue;
      }

      console.log(`  ${book.title} (${book.pageCount ?? "?"} pages)`);

      await goodreadsService.scrapeEditionsFilters(book.legacyId);

      for (const format of ["Kindle Edition", "ebook"]) {
        await goodreadsService.scrapeFilteredEditions(book.legacyId, {
          language: "spa",
          format,
        });
      }
    }
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Scraping error:", message);
  } finally {
    await browserClient.close();
  }
}

main().catch(console.error);
