import { BLOG_URL, GOODREADS_URL, WORK_URL } from "../src/config/constants";
import { BrowserClient } from "../src/core/browser-client";
import { CacheManager } from "../src/core/cache-manager";
import { GoodreadsService } from "../src/services/goodreads-service";
import type { Blog, Book, BookFilterOptions, Edition } from "../src/types";

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
    formats: [],
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
  --blogId=<id>       ID del blog de Goodreads (requerido)
  --language=<code>   Código de idioma (default: spa)
                      Ejemplos: spa, eng, por, ita, fra, deu, etc.
  --format=<fmt>      Formato(s) del libro (opcional, separados por coma)
                      Formatos válidos: ${VALID_FORMATS.join(", ")}
  --sort=<orden>      Orden de las ediciones (default: num_ratings)
                      Opciones: num_ratings, avg_rating, publish_date
  --help, -h          Muestra esta ayuda

Ejemplos:
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
    console.error("❌ Error: Debes proporcionar un ID de blog.");
    process.exit(1);
  }

  const invalidFormats = formats.filter((f) => !VALID_FORMATS.includes(f as ValidFormat));
  if (invalidFormats.length > 0) {
    console.error(
      `❌ Error: Formato(s) '${invalidFormats.join(", ")}' no válido(s). Formatos válidos: ${VALID_FORMATS.join(", ")}`,
    );
    process.exit(1);
  }

  console.log(`🚀 Iniciando flujo de trabajo para Blog ID: ${blogId}`);
  console.log(
    `⚙  Filtros de edición: Idioma=${language}, Formato=${formats.join(", ") || "Cualquiera"}, Sort=${sort}`,
  );

  const browserClient = new BrowserClient();
  const cache = new CacheManager();
  const finalReport: BookReport[] = [];
  const errors: { id: string; title: string; error: string }[] = [];

  try {
    const page = await browserClient.launch();
    page.setDefaultNavigationTimeout(60000);
    const service = new GoodreadsService(page);

    // 1. Scrape del Blog
    console.log("\n📚 PASO 1: Analizando Blog...");
    await service.scrapeBlog(blogId);

    const blogUrl = `${GOODREADS_URL}${BLOG_URL}${blogId}`;
    const blogDataJson = await cache.get(blogUrl, "-parsed.json");

    if (!blogDataJson) {
      throw new Error("❌ No se pudieron recuperar los datos del blog de la caché.");
    }

    const blogData: Blog = JSON.parse(blogDataJson);
    const books: (Book & { section?: string })[] = blogData.mentionedBooks || [];

    console.log(`✅ Blog analizado. Se encontraron ${books.length} libros mencionados.`);

    // 2. Procesar cada libro
    console.log("\n📖 PASO 2: Procesando libros y buscando ediciones...");

    for (const [index, bookRef] of books.entries()) {
      console.log(`\n---------------------------------------------------------`);
      console.log(
        `Processing Book ${index + 1}/${books.length}: ID ${bookRef.id} - "${bookRef.title || "Desconocido"}"`,
      );

      const bookReportItem: BookReport = {
        ...bookRef,
        sourceBlogId: blogId,
        editionsFound: [],
      };

      try {
        // Scrape del libro
        const bookDetails = await service.scrapeBook(bookRef.id);

        if (!bookDetails) {
          throw new Error(`No se pudieron obtener detalles para el libro ${bookRef.id}`);
        }

        // Actualizar info del libro con datos más detallados
        Object.assign(bookReportItem, bookDetails);

        if (!bookDetails.legacyId) {
          throw new Error("No se encontró Legacy ID (Work ID)");
        }

        const legacyId = bookDetails.legacyId;
        console.log(`🔹 Work ID encontrado: ${legacyId}`);
        console.log(`🔍 Buscando ediciones en idioma '${language}'...`);

        // Scrape Filtros (Metadata)
        await service.scrapeEditionsFilters(legacyId);

        // Scrape Ediciones Filtradas (por cada formato si se especifican varios)
        const formatsToProcess = formats.length > 0 ? formats : [undefined];
        const allEditions: Edition[] = [];

        for (const format of formatsToProcess) {
          const filterOptions: BookFilterOptions = {
            language: language,
            sort: sort,
            format: format,
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
            allEditions.push(...editions);
          }
        }

        // Deduplicate editions by link
        const uniqueEditions = allEditions.filter(
          (edition, index, self) => index === self.findIndex((e) => e.link === edition.link),
        );

        bookReportItem.editionsFound = uniqueEditions;
        console.log(`✅ ${uniqueEditions.length} ediciones agregadas al reporte.`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`❌ Error procesando libro ${bookRef.id}: ${errorMessage}`);
        bookReportItem.processingError = errorMessage;
        errors.push({
          id: bookRef.id,
          title: bookRef.title || "Desconocido",
          error: errorMessage,
        });
      } finally {
        finalReport.push(bookReportItem);
      }
    }

    // 3. Generar JSON Final
    console.log("\n💾 PASO 3: Guardando reporte final...");
    const reportFilename = `report-${blogId}-${language}.json`;

    const fs = await import("node:fs");
    const path = await import("node:path");
    const finalPath = path.resolve(process.cwd(), reportFilename);

    fs.writeFileSync(finalPath, JSON.stringify(finalReport, null, 2));

    console.log(`🎉 Reporte guardado exitosamente en: ${finalPath}`);
    console.log(`📊 Total libros procesados: ${finalReport.length}`);
    console.log(
      `📚 Libros con ediciones encontradas: ${finalReport.filter((b) => b.editionsFound.length > 0).length}`,
    );

    if (errors.length > 0) {
      console.log("\n!  RESUMEN DE ERRORES:");
      errors.forEach((err, idx) => {
        console.log(`${idx + 1}. [${err.id}] ${err.title}`);
        console.log(`   Error: ${err.error}`);
      });
    }
  } catch (error: unknown) {
    const fatalMessage = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error fatal en el flujo de trabajo:", fatalMessage);
  } finally {
    await browserClient.close();
  }
}

main();
