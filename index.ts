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
    const bookId = "241039381-the-last-contract-of-isako";
    const blogId = "3046-8-new-books-recommended-by-readers-this-week";

    // Iniciamos el servicio directamente con el cliente.
    // El navegador NO se lanzará a menos que sea estrictamente necesario (Fallback).
    const goodreadsService = new GoodreadsService(browserClient);

    console.log("--- 1. PRUEBA DE BLOG ---");
    await goodreadsService.scrapeBlog(blogId);
    console.log("✅ Blog procesado.");

    console.log("\n--- 2. PRUEBA DE LIBRO INDIVIDUAL ---");
    const book = await goodreadsService.scrapeBook(bookId);

    if (book?.legacyId) {
      console.log(`📚 Libro encontrado: ${book.title} (Legacy ID: ${book.legacyId})`);

      console.log("\n--- 3. PRUEBA DE EDICIONES FILTRADAS (SPA + EBOOK) ---");
      await goodreadsService.scrapeEditionsFilters(book.legacyId);

      await goodreadsService.scrapeFilteredEditions(book.legacyId, {
        language: "spa",
        format: "Kindle Edition",
      });
      console.log("✅ Ediciones filtradas procesadas.");
    } else {
      console.log("! No se pudo extraer la información del libro o no tiene Legacy ID.");
    }
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("❌ Ocurrió un error durante el proceso de scraping:", message);
  } finally {
    // browserClient.close() solo cerrará el navegador si llegó a abrirse.
    await browserClient.close();
    console.log("\n✨ Todas las pruebas completadas.");
  }
}

main().catch(console.error);
