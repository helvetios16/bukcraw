import EventEmitter from "node:events";
import fs from "node:fs";
import path from "node:path";
import { BLOG_URL, GOODREADS_URL, WORK_URL } from "../../config/constants";
import { BrowserClient } from "../../core/browser-client";
import { CacheManager } from "../../core/cache-manager";
import { GoodreadsService } from "../../services/goodreads-service";
import type { Blog, Book, BookFilterOptions, Edition } from "../../types";

export interface BookReport extends Book {
  editionsFound: Edition[];
  processingError?: string;
  sourceBlogId: string;
}

export interface WorkflowEvents {
  log: (message: string) => void;
  error: (error: { id: string; title: string; error: string }) => void;
  progress: (current: number, total: number, currentBookTitle: string) => void;
  "edition-search": (status: {
    type: "page" | "cache";
    state: "searching" | "found" | "empty";
    count?: number;
  }) => void;
  done: (reportPath: string, stats: { total: number; withEditions: number }) => void;
  fatal: (message: string) => void;
}

export class WorkflowRunner extends EventEmitter {
  private browserClient: BrowserClient | null = null;
  private isRunning = false;

  public async start(
    blogId: string,
    options: { language: string; format: string; sort: string } = {
      language: "spa",
      format: "",
      sort: "num_ratings",
    },
  ) {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    const { language, format, sort } = options;

    this.emit("log", `🚀 Iniciando flujo de trabajo para Blog ID: ${blogId}`);
    this.emit(
      "log",
      `⚙  Filtros: Idioma=${language}, Formato=${format || "Cualquiera"}, Sort=${sort}`,
    );

    this.browserClient = new BrowserClient();
    const cache = new CacheManager();
    const finalReport: BookReport[] = [];
    const errors: { id: string; title: string; error: string }[] = [];

    try {
      const page = await this.browserClient.launch();
      page.setDefaultNavigationTimeout(60000);
      const service = new GoodreadsService(page);

      // 1. Scrape del Blog
      this.emit("log", "📚 PASO 1: Analizando Blog...");
      await service.scrapeBlog(blogId);

      const blogUrl = `${GOODREADS_URL}${BLOG_URL}${blogId}`;
      const blogDataJson = await cache.get(blogUrl, "-parsed.json");

      if (!blogDataJson) {
        throw new Error("❌ No se pudieron recuperar los datos del blog de la caché.");
      }

      const blogData: Blog = JSON.parse(blogDataJson);
      const books: (Book & { section?: string })[] = blogData.mentionedBooks || [];

      this.emit("log", `✅ Blog analizado. Se encontraron ${books.length} libros mencionados.`);

      // 2. Procesar cada libro
      this.emit("log", "📖 PASO 2: Procesando libros y buscando ediciones...");

      for (const [index, bookRef] of books.entries()) {
        if (!this.isRunning) {
          break; // Permitir cancelación
        }

        this.emit("progress", index + 1, books.length, bookRef.title || "Desconocido");
        this.emit("log", `Procesando Libro ${index + 1}/${books.length}: ${bookRef.title}`);

        const bookReportItem: BookReport = {
          ...bookRef,
          sourceBlogId: blogId,
          editionsFound: [],
        };

        try {
          const bookDetails = await service.scrapeBook(bookRef.id);

          if (!bookDetails) {
            throw new Error(`No se pudieron obtener detalles para el libro ${bookRef.id}`);
          }

          Object.assign(bookReportItem, bookDetails);

          if (!bookDetails.legacyId) {
            throw new Error("No se encontró Legacy ID (Work ID)");
          }

          const legacyId = bookDetails.legacyId;
          this.emit("edition-search", { type: "page", state: "searching" });

          // Scrape Filtros (Metadata)
          await service.scrapeEditionsFilters(legacyId);

          // Scrape Ediciones Filtradas
          const filterOptions: BookFilterOptions = {
            language: language,
            sort: sort,
            format: format || undefined,
          };

          await service.scrapeFilteredEditions(legacyId, filterOptions);

          // Recuperar ediciones guardadas en caché
          const query = new URLSearchParams();
          query.append("utf8", "✓");
          query.append("sort", sort);
          if (format) {
            query.append("filter_by_format", format);
          }
          if (language) {
            query.append("filter_by_language", language);
          }

          const editionsUrlKey = `${GOODREADS_URL}${WORK_URL}${legacyId}?${query.toString()}`;
          const editionsJson = await cache.get(editionsUrlKey, "-editions.json");

          if (editionsJson) {
            const editions: Edition[] = JSON.parse(editionsJson);
            bookReportItem.editionsFound = editions;
            this.emit("edition-search", {
              type: "cache",
              state: "found",
              count: editions.length,
            });
            this.emit("log", `✅ ${editions.length} ediciones agregadas al reporte.`);
          } else {
            this.emit("edition-search", { type: "cache", state: "empty" });
            this.emit("log", "! No se encontró el archivo de ediciones en caché.");
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.emit("log", `❌ Error procesando libro ${bookRef.id}: ${errorMessage}`);
          bookReportItem.processingError = errorMessage;
          const errorObj = {
            id: bookRef.id,
            title: bookRef.title || "Desconocido",
            error: errorMessage,
          };
          errors.push(errorObj);
          this.emit("error", errorObj);
        } finally {
          finalReport.push(bookReportItem);
        }
      }

      // 3. Generar JSON Final
      this.emit("log", "💾 PASO 3: Guardando reporte final...");
      const reportFilename = `report-${blogId}-${language}.json`;
      const finalPath = path.resolve(process.cwd(), reportFilename);

      fs.writeFileSync(finalPath, JSON.stringify(finalReport, null, 2));

      const stats = {
        total: finalReport.length,
        withEditions: finalReport.filter((b) => b.editionsFound.length > 0).length,
      };

      this.emit("done", finalPath, stats);
    } catch (error: unknown) {
      const fatalMessage = error instanceof Error ? error.message : String(error);
      this.emit("fatal", fatalMessage);
    } finally {
      if (this.browserClient) {
        await this.browserClient.close();
        this.browserClient = null;
      }
      this.isRunning = false;
    }
  }

  public stop() {
    this.isRunning = false;
  }
}
