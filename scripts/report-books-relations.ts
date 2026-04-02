import inquirer from "inquirer";
import { DatabaseService } from "../src/core/database";
import type { Book, Edition } from "../src/types";

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
 * Interface for the final exported report structure.
 */
interface FinalReportOutput {
  generatedAt: string;
  count: number;
  blogs: { id: string; title: string; url: string }[];
  books: BookReport[];
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
      params.language = arg.split("=")[1] ?? "";
    } else if (arg.startsWith("--output=")) {
      params.output = arg.split("=")[1] ?? "report-database-books.json";
    } else if (arg.startsWith("--blogs=")) {
      const blogsValue = arg.split("=")[1];
      params.blogs = blogsValue ? blogsValue.split(",").filter(Boolean) : [];
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

      // Vim navigation support (j/k)
      const handleVimNavigation = (_ch: string, key: { name?: string }) => {
        if (key?.name === "j") {
          process.stdin.emit("keypress", null, { name: "down" });
        } else if (key?.name === "k") {
          process.stdin.emit("keypress", null, { name: "up" });
        }
      };
      process.stdin.on("keypress", handleVimNavigation);

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

      process.stdin.removeListener("keypress", handleVimNavigation);

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
    const booksByCanonicalKey = new Map<string, BookReport>();

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
      targetBlogs.length > 0
        ? allBooks.filter((b) => {
            const normalizedId = b.id.match(/^\d+/)?.[0] || b.id;
            return blogsByBookId.has(normalizedId);
          })
        : allBooks;

    if (targetBlogs.length > 0 && filteredBooks.length === 0) {
      console.warn("! No se encontraron libros para los blogs seleccionados.");
    }

    for (const [index, book] of filteredBooks.entries()) {
      if (index % 100 === 0 && index > 0) {
        process.stdout.write(`Procesando... ${index}/${filteredBooks.length}\r`);
      }

      // Canonical Key: Normalized Title + Author
      // Normalize: lowercase, remove special characters
      const canonicalTitle = book.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[^a-z0-9]/g, ""); // remove non-alphanumeric

      const canonicalAuthor = (book.author || "Unknown")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

      const canonicalKey = `${canonicalTitle}-${canonicalAuthor}`;

      const normalizedBookId = book.id.match(/^\d+/)?.[0] || book.id;
      const relatedBlogs = blogsByBookId.get(normalizedBookId) || [];

      // Obtener ediciones (filtrando por idioma si es necesario)
      let editions: Edition[] = [];
      if (book.legacyId) {
        editions = dbService.getEditions(book.legacyId, language || undefined);
      }

      if (booksByCanonicalKey.has(canonicalKey)) {
        const existingReport = booksByCanonicalKey.get(canonicalKey)!;

        // Merge blogs (avoiding duplicates)
        for (const blog of relatedBlogs) {
          if (!existingReport.blogs.some((b) => b.id === blog.id)) {
            existingReport.blogs.push(blog);
          }
        }

        // Merge editions (avoiding duplicates by link)
        for (const edition of editions) {
          if (!existingReport.editionsFound.some((e) => e.link === edition.link)) {
            existingReport.editionsFound.push(edition);
          }
        }

        // If current book has more info (e.g. description), update it
        if (!existingReport.description && book.description) {
          existingReport.description = book.description;
        }
      } else {
        const bookReportItem: BookReport = {
          ...book,
          blogs: relatedBlogs,
          editionsFound: editions,
        };
        booksByCanonicalKey.set(canonicalKey, bookReportItem);
      }
    }

    const finalBooks = Array.from(booksByCanonicalKey.values());

    // Extraer blogs únicos presentes en el reporte para el filtro
    const blogsInReport = new Map<string, { id: string; title: string; url: string }>();
    for (const book of finalBooks) {
      for (const blog of book.blogs) {
        if (!blogsInReport.has(blog.id)) {
          blogsInReport.set(blog.id, blog);
        }
      }
    }

    const finalReport: FinalReportOutput = {
      generatedAt: new Date().toISOString(),
      count: finalBooks.length,
      blogs: Array.from(blogsInReport.values()).sort((a, b) => a.title.localeCompare(b.title)),
      books: finalBooks,
    };

    console.log(`\n✅ Procesamiento completado.`);

    // 3. Generar JSON Final
    console.log("\n💾 PASO 3: Guardando reporte final...");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const finalOutputName =
      output === "report-database-books.json" ? `report-database-books-${timestamp}.json` : output;

    const fs = await import("node:fs");
    const path = await import("node:path");
    const finalPath = path.resolve(process.cwd(), finalOutputName);

    fs.writeFileSync(finalPath, JSON.stringify(finalReport, null, 2));

    console.log(`🎉 Reporte guardado exitosamente en: ${finalPath}`);
    console.log(`📊 Total libros reportados: ${finalReport.books.length}`);
    console.log(
      `📚 Libros con ediciones encontradas: ${finalReport.books.filter((b) => b.editionsFound.length > 0).length}`,
    );
  } catch (error: unknown) {
    const fatalMessage = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error fatal generando el reporte:", fatalMessage);
  } finally {
    dbService.close();
  }
}

main();
