import { DatabaseService } from "../src/core/database";
import type { Book, Edition } from "../src/types";
import inquirer from "inquirer";

/**
 * Interface for the final book report item.
 */
interface BookReport extends Book {
  editionsFound: Edition[];
  blogs: { id: string; title: string; url: string }[];
}

/**
 * Interface for parsed command line arguments.
 */
interface ReportArgs {
  language: string;
  output: string;
  blogs: string[];
}

/**
 * Parses command line arguments for the workflow.
 * @returns {ReportArgs} The parsed arguments.
 */
function parseArgs(): ReportArgs {
  const args: string[] = process.argv.slice(2);
  const params: ReportArgs = {
    language: "", // Default to all languages if empty
    output: "report-database-books.json",
    blogs: [],
  };

  for (const arg of args) {
    if (arg.startsWith("--language=")) {
      params.language = arg.split("=")[1];
    } else if (arg.startsWith("--output=")) {
      params.output = arg.split("=")[1];
    } else if (arg.startsWith("--blogs=")) {
      params.blogs = arg.split("=")[1].split(",").filter(Boolean);
    }
  }

  return params;
}

async function main(): Promise<void> {
  const args = parseArgs();
  let { language, output, blogs: targetBlogs } = args;

  const dbService = new DatabaseService();

  try {
    // Si no se pasaron blogs por argumento, preguntar interactivamente
    if (targetBlogs.length === 0) {
      console.log("🔍 Buscando blogs disponibles en la base de datos...");
      const allBlogs = dbService.getAllBlogs();

      if (allBlogs.length === 0) {
        console.error("❌ No se encontraron blogs en la base de datos.");
        return;
      }

      // Ordenar blogs alfabéticamente
      allBlogs.sort((a, b) => a.title.localeCompare(b.title));

      const answer = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selectedBlogs",
          message: "Selecciona los blogs que deseas incluir en el reporte:",
          choices: allBlogs.map((blog) => ({
            name: `${blog.title} (${blog.id})`,
            value: blog.id,
            checked: true, // Por defecto todos seleccionados, usuario puede deseleccionar
          })),
          pageSize: 20,
          loop: false,
        },
      ]);

      targetBlogs = answer.selectedBlogs;

      if (targetBlogs.length === 0) {
        console.log("⚠️ Ningún blog seleccionado. Generando reporte de TODOS los libros...");
      }
    }

    console.log(`🚀 Iniciando generación de reporte...`);
    if (language) {
      console.log(`⚙  Filtro de idioma: ${language}`);
    }
    if (targetBlogs.length > 0) {
      console.log(`⚙  Blogs seleccionados (${targetBlogs.length}): ${targetBlogs.join(", ")}`);
    }

    const db = dbService.getDb();
    const finalReport: BookReport[] = [];

    // 1. Obtener relaciones blog-libro
    console.log("\n📚 PASO 1: Recuperando relaciones...");

    let querySql = `
      SELECT bb.book_id, b.id as blog_id, b.title as blog_title, b.url as blog_url
      FROM blog_books bb
      JOIN blogs b ON bb.blog_id = b.id
    `;

    const queryParams: string[] = [];
    if (targetBlogs.length > 0) {
      const placeholders = targetBlogs.map(() => "?").join(",");
      querySql += ` WHERE b.id IN (${placeholders})`;
      queryParams.push(...targetBlogs);
    }

    const blogRelationsQuery = db.prepare(querySql);
    const allBlogRelations = blogRelationsQuery.all(...queryParams) as {
      book_id: string;
      blog_id: string;
      blog_title: string;
      blog_url: string;
    }[];

    // Agrupar relaciones por book_id
    const blogsByBookId = new Map<string, { id: string; title: string; url: string }[]>();
    for (const rel of allBlogRelations) {
      // Normalizar ID: Extraer solo la parte numérica inicial (ej: "123-titulo" -> "123")
      // Esto es necesario porque blog_books guarda el slug completo pero la tabla books solo el ID numérico
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

    // 2. Obtener libros y filtrar
    console.log("\n📖 PASO 2: Procesando libros y ediciones...");
    const allBooks = dbService.getAllBooks();

    // Filtrar libros: Si hay blogs seleccionados, solo mostrar los que tengan relación con esos blogs
    const filteredBooks =
      targetBlogs.length > 0 ? allBooks.filter((b) => blogsByBookId.has(b.id)) : allBooks;

    if (targetBlogs.length > 0 && filteredBooks.length === 0) {
      console.warn("! No se encontraron libros para los blogs seleccionados.");
    }

    for (const [index, book] of filteredBooks.entries()) {
      if (index % 100 === 0 && index > 0) {
        process.stdout.write(`Procesando... ${index}/${filteredBooks.length}\r`);
      }

      const relatedBlogs = blogsByBookId.get(book.id) || [];

      // Obtener ediciones (filtrando por idioma si es necesario)
      let editions: Edition[] = [];
      if (book.legacyId) {
        editions = dbService.getEditions(book.legacyId, language || undefined);
      }

      const bookReportItem: BookReport = {
        ...book,
        blogs: relatedBlogs,
        editionsFound: editions,
      };

      finalReport.push(bookReportItem);
    }

    console.log(`\n✅ Procesamiento completado.`);

    // 3. Generar JSON Final
    console.log("\n💾 PASO 3: Guardando reporte final...");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const finalOutputName =
      output === "report-database-books.json"
        ? `report-database-books-${timestamp}.json`
        : output;

    const fs = await import("node:fs");
    const path = await import("node:path");
    const finalPath = path.resolve(process.cwd(), finalOutputName);

    fs.writeFileSync(finalPath, JSON.stringify(finalReport, null, 2));

    console.log(`🎉 Reporte guardado exitosamente en: ${finalPath}`);
    console.log(`📊 Total libros reportados: ${finalReport.length}`);
    console.log(
      `📚 Libros con ediciones encontradas: ${finalReport.filter((b) => b.editionsFound.length > 0).length}`,
    );
  } catch (error: unknown) {
    const fatalMessage = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error fatal generando el reporte:", fatalMessage);
  } finally {
    dbService.close();
  }
}

main();
