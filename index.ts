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
    // const bookId = "123224254-mistborn";
    const bookId = "241039381-the-last-contract-of-isako";
    // const blogId = "3037-a-celebration-of-friends-to-lovers-romances";
    const blogId = "3046-8-new-books-recommended-by-readers-this-week";

    const page = await browserClient.launch();
    // Aumentar timeout para estabilidad
    page.setDefaultNavigationTimeout(60000);
    const goodreadsService = new GoodreadsService(page);

    console.log("--- 1. PRUEBA DE BLOG ---");
    await goodreadsService.scrapeBlog(blogId);
    console.log("✅ Blog procesado y guardado en DB.");

    console.log("\n--- 2. PRUEBA DE LIBRO INDIVIDUAL ---");
    const book = await goodreadsService.scrapeBook(bookId);

    if (book?.legacyId) {
      console.log(`📚 Libro encontrado: ${book.title} (Legacy ID: ${book.legacyId})`);

      console.log("\n--- 3. PRUEBA DE EDICIONES FILTRADAS (SPA + EBOOK) ---");
      // Primero obtenemos los metadatos de filtros (requerido por el servicio)
      await goodreadsService.scrapeEditionsFilters(book.legacyId);

      // Aplicamos el filtro solicitado: Idioma Español y Formato Kindle (ebook)
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
    await browserClient.close();
    console.log("\n✨ Todas las pruebas completadas.");
  }
}

main().catch(console.error);
