/**
 * @file editions-parser.ts
 * @description Parser responsible for extracting filter and sort options from Goodreads editions page HTML.
 */

import { parseHTML } from "linkedom";

export interface FilterOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface EditionsFilters {
  sort: FilterOption[];
  format: FilterOption[];
  language: FilterOption[];
}

export interface PaginationInfo {
  hasNextPage: boolean;
  totalPages: number;
}

export function parseEditionsHtml(html: string): EditionsFilters | null {
  try {
    const { document } = parseHTML(html);

    const extractOptions = (selectName: string): FilterOption[] => {
      const select = document.querySelector(`select[name="${selectName}"]`);
      if (!select) {
        return [];
      }

      return Array.from(select.querySelectorAll("option"))
        .map((opt) => {
          const value = opt.getAttribute("value")?.trim() || "";
          const label = opt.textContent?.trim() || "";
          const selected = opt.hasAttribute("selected");
          return { value, label, selected };
        })
        .filter((opt) => opt.value !== ""); // Filter out empty value options (placeholders)
    };

    return {
      sort: extractOptions("sort"),
      format: extractOptions("filter_by_format"),
      language: extractOptions("filter_by_language"),
    };
  } catch (error) {
    console.error("Error parsing editions HTML:", error);
    return null;
  }
}

export function extractPaginationInfo(html: string): PaginationInfo {
  try {
    const { document } = parseHTML(html);

    // 1. Intentar determinar el total mediante el texto "Showing 1-30 of 123"
    // Este texto suele estar en div.infoText o .showingPages
    const infoText = document.querySelector(".infoText, .showingPages")?.textContent?.trim();
    let totalFromInfo = 0;

    if (infoText) {
      // Regex para capturar: Showing 1-30 of 123
      const match = infoText.match(/(\d+)-(\d+)\s+of\s+([\d,]+)/i);
      if (match?.[2] && match[3]) {
        const endItem = parseInt(match[2].replace(/,/g, ""), 10);
        const startItem = parseInt(match[1].replace(/,/g, ""), 10);
        const totalItems = parseInt(match[3].replace(/,/g, ""), 10);

        const itemsPerPage = endItem - startItem + 1;

        if (itemsPerPage > 0) {
          totalFromInfo = Math.ceil(totalItems / itemsPerPage);
        }
      }
    }

    // 2. Localizar el contenedor de paginación para buscar el número de página más alto visible
    let container = document.querySelector(".pagination");
    if (!container) {
      const nextPage = document.querySelector("a.next_page");
      if (nextPage) {
        container = nextPage.parentElement;
      } else {
        const current = document.querySelector("em.current");
        if (current) {
          container = current.parentElement;
        }
      }
    }

    let maxPageFromLinks = 1;
    if (container) {
      const allLinks = container.querySelectorAll("a, em.current");
      allLinks.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && /^\d+$/.test(text)) {
          const pageNum = parseInt(text, 10);
          if (pageNum > maxPageFromLinks) {
            maxPageFromLinks = pageNum;
          }
        }
      });
    }

    // Usamos el mayor de los dos métodos
    const totalPages = Math.max(maxPageFromLinks, totalFromInfo);
    const hasNextPage = !!document.querySelector("a.next_page");

    return {
      hasNextPage,
      totalPages,
    };
  } catch (error) {
    console.error("Error extracting pagination info:", error);
    return { hasNextPage: false, totalPages: 1 };
  }
}
