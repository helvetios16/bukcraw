/**
 * @file parse-editions-filters.ts
 * @description Script to parse sort and filter options from a cached Goodreads editions page.
 */

import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const FILE_PATH =
  "C:\\Users\\OMEN\\Documents\\Programacion\\Typescript\\bun-book-crawler\\cache\\2026-01-23\\misc\\4479e89666be21dc4bda0a307159dc4a.html";

function parseFilters() {
  console.log(`📚 Leyendo archivo: ${FILE_PATH}`);

  try {
    const html = readFileSync(FILE_PATH, "utf-8");
    const { document } = parseHTML(html);

    const extractOptions = (selectName: string) => {
      const select = document.querySelector(`select[name="${selectName}"]`);
      if (!select) {
        console.warn(`! No se encontró el selector con nombre: ${selectName}`);
        return [];
      }

      return Array.from(select.querySelectorAll("option")).map((opt) => ({
        value: opt.getAttribute("value") || "",
        label: opt.textContent?.trim() || "",
        selected: opt.hasAttribute("selected"),
      }));
    };

    const sortOptions = extractOptions("sort");
    const formatOptions = extractOptions("filter_by_format");
    const languageOptions = extractOptions("filter_by_language");

    console.log("\n\ud83d\udcca --- Opciones de Ordenamiento (Sort) ---");
    console.table(sortOptions);

    console.log("\n\ud83c\udf44 --- Filtros de Formato ---");
    console.table(formatOptions.filter((o) => o.value !== ""));

    console.log("\n\ud83c\udf0e --- Filtros de Idioma ---");
    const languages = languageOptions.filter((o) => o.value !== "");
    console.table(languages);

    console.log(`
Total idiomas encontrados: ${languages.length}`);
  } catch (error) {
    console.error("\u274c Error al procesar el archivo:", error);
  }
}

parseFilters();
