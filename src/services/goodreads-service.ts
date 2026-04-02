/**
 * @file goodreads-service.ts
 * @description Service responsible for navigating Goodreads and storing book information.
 */

import type { ElementHandle, Page } from "puppeteer";
import { BLOG_URL, BOOK_URL, GOODREADS_URL, WORK_URL } from "../config/constants";
import type { BrowserClient } from "../core/browser-client";
import { CacheManager } from "../core/cache-manager";
import { DatabaseService } from "../core/database";
import { HttpClient } from "../core/http-client";
import type { Blog, Book, BookFilterOptions, Edition } from "../types";
import { delay, getErrorMessage, isValidBookId } from "../utils/util";
import { parseBlogHtml } from "./blog-parser";
import { parseBookData } from "./book-parser";
import {
  type EditionsFilters,
  extractPaginationInfo,
  parseEditionsHtml,
  parseEditionsList,
} from "./editions-parser";

interface SaveEditionsParams {
  baseUrl: string;
  legacyId: string | number;
  editions: Edition[];
  urls: string[];
  totalPages: number;
  options: BookFilterOptions;
}

export class GoodreadsService {
  private page: Page | null = null;
  private readonly browserClient?: BrowserClient;
  private readonly cache = new CacheManager();
  private readonly db = new DatabaseService();
  private http: HttpClient | null = null;

  // Métricas de telemetría
  private stats = {
    httpSuccess: 0,
    browserFallback: 0,
    cacheHits: 0,
  };

  constructor(pageOrClient: Page | BrowserClient) {
    if ("launch" in pageOrClient) {
      this.browserClient = pageOrClient;
    } else {
      this.page = pageOrClient;
    }
  }

  /**
   * Initializes the service by ensuring a valid session (cookies) is available.
   * If no valid session exists (< 20 mins), it launches the browser to get one.
   */
  public async initSession(): Promise<void> {
    const latestSession = this.db.getLatestSession();

    if (latestSession && this.isSessionFresh(latestSession.createdAt)) {
      console.log("🔑 Usando sesión existente (cookies) de la base de datos.");
      this.http = new HttpClient(latestSession.cookies);
      return;
    }

    console.log("! No hay sesión válida o ha expirado (> 20 min). Obteniendo nuevas cookies...");

    try {
      await this.ensureBrowserPage();
      if (!this.page) {
        throw new Error("No se pudo iniciar el navegador.");
      }

      // Navegar a la home para obtener cookies frescas
      console.log(`🌐 Obteniendo cookies desde ${GOODREADS_URL}...`);
      await this.page.goto(GOODREADS_URL, { waitUntil: "domcontentloaded" });

      const cookiesArr = await this.page.cookies();
      const cookiesStr = cookiesArr.map((c) => `${c.name}=${c.value}`).join("; ");

      if (!cookiesStr) {
        throw new Error("No se obtuvieron cookies del navegador.");
      }

      this.db.saveSession(cookiesStr);
      this.http = new HttpClient(cookiesStr);
      console.log("✅ Nuevas cookies guardadas e inicializadas.");
    } catch (error: unknown) {
      console.error("❌ Error crítico inicializando sesión:", getErrorMessage(error));
      throw new Error(
        "FALLO_INICIALIZACION_SESION: No se pudo obtener una sesión válida de Goodreads.",
      );
    }
  }

  private isSessionFresh(createdAt: string): boolean {
    const createdDate = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins < 20;
  }

  public async scrapeBook(id: string): Promise<Book | null> {
    if (!isValidBookId(id)) {
      throw new Error(`Invalid Book ID format: ${id}`);
    }

    // 0. Check Database Cache (Level 1)
    const dbBook = this.db.getBook(id);
    if (dbBook) {
      if (this.isCacheValid(dbBook.updatedAt)) {
        console.log(`💾 DB Cache hit: Libro ${id} encontrado en base de datos.`);
        this.stats.cacheHits++;
        return dbBook;
      }
      console.log(`! DB Cache expired: Libro ${id} (updated: ${dbBook.updatedAt}). Re-scraping...`);
    }

    const url = `${GOODREADS_URL}${BOOK_URL}${id}`;
    console.log(`🔎 Buscando libro ${id}...`);

    const fileBook = await this.tryLoadBookFromFileCache(url);
    if (fileBook) {
      return fileBook;
    }

    // 2. Navegación Híbrida (Level 3)
    const { content, method } = await this.fetchContentWithFallback(url);

    let bookData: Book | null = null;

    // 3. Extracción de Datos (Next.js Data)
    // Si usamos HTTP, parseamos el string. Si usamos Puppeteer, usamos la página.
    if (method === "http") {
      bookData = await this.processNextDataFromHtml(content, url);
    } else if (this.page) {
      const nextDataElement = await this.page.$("#__NEXT_DATA__");
      if (nextDataElement) {
        bookData = await this.processNextDataFromElement(nextDataElement, url);
      }
    }

    if (!bookData) {
      console.warn("! No se pudo extraer la información del libro.");
    }

    // 4. Guardar HTML como respaldo
    await this.cache.save({ url, content, force: false, extension: ".html" });

    return bookData;
  }

  public async scrapeEditionsFilters(legacyId: string | number): Promise<void> {
    const url = `${GOODREADS_URL}${WORK_URL}${legacyId}`;
    console.log(`🔎 Buscando ediciones del libro (Work ID: ${legacyId})...`);

    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        console.log("📦 Cache hit (Parsed JSON).");
        return;
      }
    } catch (error: unknown) {
      console.warn("i Cache miss o error al leer caché de ediciones:", getErrorMessage(error));
    }

    const { content } = await this.fetchContentWithFallback(url);
    await this.cache.save({ url, content, force: false, extension: ".html" });

    console.log("⚙  Parseando filtros de ediciones...");
    const editionsData = parseEditionsHtml(content);

    if (editionsData) {
      const jsonContent = JSON.stringify(editionsData, null, 2);
      await this.cache.save({
        url,
        content: jsonContent,
        force: true,
        extension: "-parsed.json",
      });
      console.log(
        `✅ Datos de ediciones parseados y guardados (${editionsData.language.length} idiomas encontrados).`,
      );
    } else {
      console.warn("! No se pudo parsear la información de ediciones.");
    }
  }

  public async scrapeBlog(id: string): Promise<void> {
    const url = `${GOODREADS_URL}${BLOG_URL}${id}`;
    console.log(`🔎 Buscando blog ${id}...`);

    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        console.log("📦 Cache hit (Parsed JSON).");
        const blogData = JSON.parse(cachedParsed) as Blog;

        if (blogData?.mentionedBooks) {
          for (const book of blogData.mentionedBooks) {
            this.db.saveBlogReference({
              blogId: id,
              bookId: book.id,
              blogTitle: blogData.title,
              blogUrl: blogData.webUrl,
            });
          }
          console.log("💾 Blog y relaciones sincronizados con DB desde caché de archivos.");
        }
        return;
      }
    } catch (error: unknown) {
      console.warn("i Cache miss o error al leer caché de blog:", getErrorMessage(error));
    }

    const { content } = await this.fetchContentWithFallback(url);
    await this.cache.save({ url, content, force: false, extension: ".html" });

    console.log("⚙  Parseando contenido del blog...");
    const blogData = parseBlogHtml(content, url);

    if (blogData) {
      const jsonContent = JSON.stringify(blogData, null, 2);
      await this.cache.save({
        url,
        content: jsonContent,
        force: true,
        extension: "-parsed.json",
      });
      console.log(
        `✅ Blog parseado y guardado (${blogData.mentionedBooks?.length || 0} libros encontrados).`,
      );

      if (blogData.mentionedBooks) {
        for (const book of blogData.mentionedBooks) {
          this.db.saveBlogReference({
            blogId: id,
            bookId: book.id,
            blogTitle: blogData.title,
            blogUrl: blogData.webUrl,
          });
        }
      }
    } else {
      console.warn("! No se pudo parsear el contenido del blog.");
    }
  }

  public async scrapeFilteredEditions(
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<void> {
    const baseUrl = `${GOODREADS_URL}${WORK_URL}${legacyId}`;

    // 0. Check DB Cache
    if (this.checkEditionsDbCache(legacyId, options.language)) {
      return;
    }

    console.log(`🔎 Verificando filtros para Work ID: ${legacyId}...`);

    // 1. Validar filtros
    await this.validateFilters(baseUrl, legacyId, options);

    // 2. Construir URL
    const baseUrlWithParams = this.buildEditionsUrl(baseUrl, options);
    console.log(`✅ Filtros validados. Iniciando escaneo en: ${baseUrlWithParams}`);

    // 3. Procesar paginación
    const { allEditions, scrapedUrls, totalPages } =
      await this.processEditionsPagination(baseUrlWithParams);

    // 4. Guardar resultados
    await this.saveEditionsResults({
      baseUrl: baseUrlWithParams,
      legacyId,
      editions: allEditions,
      urls: scrapedUrls,
      totalPages,
      options,
    });
  }

  // --- Helper Methods ---

  /**
   * Hybrid content fetcher: tries HTTP first, falls back to Puppeteer if blocked.
   */
  private async fetchContentWithFallback(
    url: string,
  ): Promise<{ content: string; method: "http" | "browser" }> {
    if (!this.http) {
      await this.initSession();
    }

    try {
      console.log(`⚡ Intentando fetch HTTP rápido: ${url}`);
      const content = await this.http?.get(url);

      if (!this.http?.isBlocked(content)) {
        console.log("✅ Fetch HTTP exitoso.");
        this.stats.httpSuccess++;
        return { content, method: "http" };
      }

      console.warn("! Fetch HTTP bloqueado (CAPTCHA detectado).");
    } catch (error: unknown) {
      console.warn(`❌ Error en fetch HTTP: ${getErrorMessage(error)}`);
    }

    console.log("🔄 Iniciando Plan B: Puppeteer fallback...");
    this.stats.browserFallback++;
    await this.ensureBrowserPage();
    if (!this.page) {
      throw new Error("No se pudo inicializar Puppeteer para el fallback.");
    }

    await this.navigateTo(url);
    const content = await this.page.content();
    return { content, method: "browser" };
  }

  /**
   * Prints a summary of the scraping efficiency.
   */
  public printTelemetry(): void {
    const totalRequests = this.stats.httpSuccess + this.stats.browserFallback;
    const efficiency =
      totalRequests > 0 ? ((this.stats.httpSuccess / totalRequests) * 100).toFixed(1) : "0";

    console.log("📊 REPORTE DE TELEMETRÍA");
    console.log("=".repeat(40));
    console.log(`🚀 Peticiones vía HTTP (⚡):    ${this.stats.httpSuccess}`);
    console.log(`🐢 Fallbacks a Browser (Puppeteer): ${this.stats.browserFallback}`);
    console.log(`📦 Cache Hits (Evitó Red):      ${this.stats.cacheHits}`);
    console.log("-".repeat(40));
    console.log(`📈 Eficiencia de Ahorro Browser:   ${efficiency}%`);
  }

  private async ensureBrowserPage(): Promise<void> {
    if (this.page) {
      return;
    }

    if (!this.browserClient) {
      throw new Error("Se requiere BrowserClient o Page para realizar el fallback a Puppeteer.");
    }

    console.log("🚀 Lanzando navegador bajo demanda...");
    this.page = await this.browserClient.launch();
    this.page.setDefaultNavigationTimeout(60000);
  }

  private async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error("Page instance is missing.");
    }

    console.log(`🌐 Navegando con Puppeteer: ${url}`);
    const response = await this.page.goto(url, { waitUntil: "domcontentloaded" });

    if (!response) {
      throw new Error("❌ No se recibió respuesta del navegador.");
    }

    const status = response.status();
    if (status === 404) {
      console.error("❌ Recurso no encontrado (404).");
      return;
    }
    if (status === 403 || status === 429) {
      throw new Error(`⛔ Acceso denegado o límite de peticiones excedido (Status: ${status}).`);
    }

    const currentUrl = this.page.url();
    if (currentUrl.includes("/user/sign_in") || currentUrl.includes("captcha")) {
      throw new Error("⛔ Redirigido a página de Login o Captcha. Se requiere intervención.");
    }

    await this.page.waitForSelector("body");
    console.log("✅ Página cargada correctamente con Puppeteer.");
  }

  private async tryLoadBookFromFileCache(url: string): Promise<Book | null> {
    try {
      const cachedData = await this.cache.get(url, ".json");
      if (cachedData) {
        console.log("📦 File Cache hit (JSON).");
        this.stats.cacheHits++;
        const book = parseBookData(JSON.parse(cachedData));
        if (book) {
          this.db.saveBook(book);
          return book;
        }
        console.warn("! Datos en caché encontrados pero inválidos o incompletos.");
      }
    } catch (error: unknown) {
      console.warn("! Error al leer/parsear caché, continuando con red:", getErrorMessage(error));
    }
    return null;
  }

  private async processNextDataFromElement(
    element: ElementHandle,
    url: string,
  ): Promise<Book | null> {
    const nextData = await this.page?.evaluate((el) => el.textContent, element);
    return this.handleNextDataJson(nextData, url);
  }

  private async processNextDataFromHtml(html: string, url: string): Promise<Book | null> {
    // Regex simple para extraer el contenido de <script id="__NEXT_DATA__">...</script>
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    return this.handleNextDataJson(match ? match[1] : null, url);
  }

  private async handleNextDataJson(jsonStr: string | null, url: string): Promise<Book | null> {
    if (!jsonStr) {
      return null;
    }

    try {
      const parsedJson = JSON.parse(jsonStr);
      await this.cache.save({
        url,
        content: JSON.stringify(parsedJson, null, 2),
        force: false,
        extension: ".json",
      });

      const bookData = parseBookData(parsedJson);
      if (bookData) {
        this.db.saveBook(bookData);
      }
      return bookData;
    } catch (e: unknown) {
      console.warn("! Fallo al procesar datos de Next.js:", getErrorMessage(e));
      return null;
    }
  }

  private checkEditionsDbCache(legacyId: string | number, language?: string): boolean {
    const dbEditions = this.db.getEditions(legacyId, language);
    const firstEdition = dbEditions?.[0];

    if (dbEditions && dbEditions.length > 0 && firstEdition) {
      // Check freshness of the first edition
      if (this.isCacheValid(firstEdition.createdAt)) {
        console.log(`💾 DB Cache hit: ${dbEditions.length} ediciones encontradas en BD.`);
        return true;
      }
      console.log(
        `! DB Cache expired: Ediciones para ${legacyId} (created: ${firstEdition.createdAt}). Re-scraping...`,
      );
    }
    return false;
  }

  private async validateFilters(
    baseUrl: string,
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<void> {
    const cachedMetadata = await this.cache.get(baseUrl, "-parsed.json");
    if (!cachedMetadata) {
      throw new Error(
        `❌ No se encontraron metadatos de ediciones para ID ${legacyId}. Ejecute 'lookBookEditions' primero.`,
      );
    }

    const validOptions = JSON.parse(cachedMetadata) as EditionsFilters;
    const { sort, format, language } = options;

    if (sort && !validOptions.sort.some((s) => s.value === sort)) {
      throw new Error(`❌ Opción de ordenamiento inválida: '${sort}'.`);
    }
    if (format && !validOptions.format.some((f) => f.value === format)) {
      throw new Error(`❌ Formato inválido: '${format}'.`);
    }
    if (language && !validOptions.language.some((l) => l.value === language)) {
      throw new Error(`❌ Idioma inválido: '${language}'.`);
    }
  }

  private buildEditionsUrl(baseUrl: string, options: BookFilterOptions): string {
    const query = new URLSearchParams();
    query.append("utf8", "✓");
    if (options.sort) {
      query.append("sort", options.sort);
    }
    if (options.format) {
      query.append("filter_by_format", options.format);
    }
    if (options.language) {
      query.append("filter_by_language", options.language);
    }
    return `${baseUrl}?${query.toString()}`;
  }

  private async processEditionsPagination(baseUrlWithParams: string) {
    const scrapedUrls: string[] = [];
    const allEditions: Edition[] = [];

    // Page 1
    const { content: page1Content } = await this.getPageContent(baseUrlWithParams);
    scrapedUrls.push(baseUrlWithParams);

    const page1Editions = parseEditionsList(page1Content);
    allEditions.push(...page1Editions);
    console.log(`📄 Página 1: ${page1Editions.length} ediciones encontradas.`);

    const pagination = extractPaginationInfo(page1Content);
    console.log(`📊 Paginación detectada: ${pagination.totalPages} páginas totales.`);

    // Next Pages
    if (pagination.totalPages > 1) {
      for (let i = 2; i <= pagination.totalPages; i++) {
        const pageUrl = `${baseUrlWithParams}&page=${i}`;
        const { content, fromCache } = await this.getPageContent(pageUrl);

        if (!fromCache) {
          await delay(2500 + Math.random() * 2500); // Respectful delay
        }

        scrapedUrls.push(pageUrl);
        const pageEditions = parseEditionsList(content);
        allEditions.push(...pageEditions);
        console.log(`📄 Página ${i}: ${pageEditions.length} ediciones encontradas.`);
      }
    }

    return { allEditions, scrapedUrls, totalPages: pagination.totalPages };
  }

  private async getPageContent(url: string): Promise<{ content: string; fromCache: boolean }> {
    const content = await this.cache.get(url, ".html");
    if (content) {
      console.log(`📦 Cache hit página.`);
      return { content, fromCache: true };
    }

    const { content: freshContent } = await this.fetchContentWithFallback(url);
    await this.cache.save({ url, content: freshContent, force: true, extension: ".html" });

    return { content: freshContent, fromCache: false };
  }

  private async saveEditionsResults(params: SaveEditionsParams): Promise<void> {
    const { baseUrl, legacyId, editions, urls, totalPages, options } = params;

    await this.cache.save({
      url: baseUrl,
      content: JSON.stringify(editions, null, 2),
      force: true,
      extension: "-editions.json",
    });

    if (editions.length > 0) {
      this.db.deleteEditions(legacyId, options.language); // Clear old/expired editions
      this.db.saveEditions(legacyId, editions);
      console.log("💾 Ediciones guardadas en Base de Datos.");
    }

    const metadata = {
      timestamp: new Date().toISOString(),
      legacyId,
      filters: options,
      stats: {
        totalPages,
        scrapedUrls: urls,
        totalEditions: editions.length,
      },
    };

    await this.cache.save({
      url: baseUrl,
      content: JSON.stringify(metadata, null, 2),
      force: true,
      extension: "-filter-meta.json",
    });

    console.log(`✅ Proceso completado. ${editions.length} ediciones guardadas.`);
  }

  private isCacheValid(dateStr?: string): boolean {
    if (!dateStr) {
      return false;
    }
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 10;
  }
}
