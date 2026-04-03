import inquirer from "inquirer";
import { DatabaseService } from "../src/core/database";
import type { Book, Edition } from "../src/types";

const ansi = (color: string) => Bun.color(color, "ansi-16m") ?? "";
const c = {
  heading: ansi("#7ec8e3"),
  success: ansi("#81c784"),
  warn: ansi("#ffb74d"),
  error: ansi("#e57373"),
  dim: ansi("#9e9e9e"),
  reset: "\x1b[0m",
};

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
    if (targetBlogs.length === 0) {
      const allBlogs = dbService.getAllBlogs();

      if (allBlogs.length === 0) {
        console.error(`${c.error}No blogs found in database.${c.reset}`);
        return;
      }

      allBlogs.sort((a, b) => a.title.localeCompare(b.title));

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
          message: "Select blogs to include in the report:",
          choices: allBlogs.map((blog) => ({
            name: `${blog.title} (${blog.id})`,
            value: blog.id,
            checked: true,
          })),
          pageSize: 20,
          loop: false,
        },
      ]);

      process.stdin.removeListener("keypress", handleVimNavigation);

      targetBlogs = answer.selectedBlogs;

      if (targetBlogs.length === 0) {
        console.log(`${c.warn}No blogs selected. Generating report for ALL books...${c.reset}`);
      }
    }

    console.log(
      `${c.heading}Report${c.reset} ${c.dim}| lang=${language || "all"} blogs=${targetBlogs.length || "all"}${c.reset}`,
    );

    const db = dbService.getDb();
    const booksByCanonicalKey = new Map<string, BookReport>();

    console.log(`\n${c.heading}--- 1. Fetching relations ---${c.reset}`);

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

    const blogsByBookId = new Map<string, { id: string; title: string; url: string }[]>();
    for (const rel of allBlogRelations) {
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

    console.log(`\n${c.heading}--- 2. Processing books ---${c.reset}`);
    const allBooks = dbService.getAllBooks();

    const filteredBooks =
      targetBlogs.length > 0
        ? allBooks.filter((b) => {
            const normalizedId = b.id.match(/^\d+/)?.[0] || b.id;
            return blogsByBookId.has(normalizedId);
          })
        : allBooks;

    if (targetBlogs.length > 0 && filteredBooks.length === 0) {
      console.warn(`${c.warn}No books found for selected blogs.${c.reset}`);
    }

    for (const [index, book] of filteredBooks.entries()) {
      if (index % 100 === 0 && index > 0) {
        process.stdout.write(`Procesando... ${index}/${filteredBooks.length}\r`);
      }

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

      let editions: Edition[] = [];
      if (book.legacyId) {
        editions = dbService.getEditions(book.legacyId, language || undefined);
      }

      const existingReport = booksByCanonicalKey.get(canonicalKey);
      if (existingReport) {
        for (const blog of relatedBlogs) {
          if (!existingReport.blogs.some((b) => b.id === blog.id)) {
            existingReport.blogs.push(blog);
          }
        }

        for (const edition of editions) {
          if (!existingReport.editionsFound.some((e) => e.link === edition.link)) {
            existingReport.editionsFound.push(edition);
          }
        }

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

    console.log(`\n${c.heading}--- 3. Saving report ---${c.reset}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const finalOutputName =
      output === "report-database-books.json" ? `report-database-books-${timestamp}.json` : output;

    const fs = await import("node:fs");
    const path = await import("node:path");
    const finalPath = path.resolve(process.cwd(), finalOutputName);

    fs.writeFileSync(finalPath, JSON.stringify(finalReport, null, 2));

    const withEditions = finalReport.books.filter((b) => b.editionsFound.length > 0).length;
    console.log(
      `${c.success}Done.${c.reset} ${withEditions}/${finalReport.books.length} books with editions. ${c.dim}${finalPath}${c.reset}`,
    );
  } catch (error: unknown) {
    const fatalMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n${c.error}Fatal error:${c.reset} ${fatalMessage}`);
  } finally {
    dbService.close();
  }
}

main();
