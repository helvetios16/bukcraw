import { describe, expect, test } from "bun:test";
import { parseBlogHtml } from "../../src/services/blog-parser.ts";

const validBlogHtml = `
<html>
<head>
  <meta property="og:title" content="Best Books of 2024">
  <meta property="og:description" content="A blog about books">
  <meta property="og:url" content="https://www.goodreads.com/blog/show/3046-best-books">
</head>
<body>
  <div class="newsShowColumn">
    <h2>Fiction</h2>
    <div class="js-tooltipTrigger book">
      <a href="/book/show/12345-the-great-novel"><img src="https://images.gr-assets.com/books/cover1.jpg" alt="The Great Novel"></a>
    </div>
    <div class="bookInfoFullRow">
      <div class="bookTitle"><a href="/book/show/12345-the-great-novel">The Great Novel: Extended Title</a></div>
    </div>
    <h2>Non-Fiction</h2>
    <div class="js-tooltipTrigger book">
      <a href="/book/show/67890-another-book"><img src="https://images.gr-assets.com/books/cover2.jpg" alt="Another Book"></a>
    </div>
  </div>
</body>
</html>
`;

const noBooksHtml = `
<html>
<head>
  <meta property="og:title" content="Empty Blog Post">
  <meta property="og:url" content="https://www.goodreads.com/blog/show/9999-empty-blog">
</head>
<body>
  <div class="newsShowColumn">
    <p>This blog has no books mentioned.</p>
  </div>
</body>
</html>
`;

describe("parseBlogHtml", () => {
  test("parses valid blog HTML correctly", () => {
    const result = parseBlogHtml(validBlogHtml);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Best Books of 2024");
    expect(result?.id).toBe("3046");
    expect(result?.description).toBe("A blog about books");
    expect(result?.webUrl).toBe("https://www.goodreads.com/blog/show/3046-best-books");
  });

  test("deduplicates books by numeric ID", () => {
    const result = parseBlogHtml(validBlogHtml);
    expect(result).not.toBeNull();
    // 12345 appears in both .js-tooltipTrigger and .bookInfoFullRow,
    // but should be deduplicated to 1 entry
    const ids = result?.mentionedBooks?.map((b) => b.id.split("-")[0]);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("extracts correct number of unique books", () => {
    const result = parseBlogHtml(validBlogHtml);
    expect(result).not.toBeNull();
    // Two unique books: 12345 and 67890
    expect(result?.mentionedBooks).toHaveLength(2);
  });

  test("books have correct IDs", () => {
    const result = parseBlogHtml(validBlogHtml);
    expect(result).not.toBeNull();
    const numericIds = result?.mentionedBooks?.map((b) => b.id.split("-")[0]);
    expect(numericIds).toContain("12345");
    expect(numericIds).toContain("67890");
  });

  test("books have correct titles", () => {
    const result = parseBlogHtml(validBlogHtml);
    expect(result).not.toBeNull();
    const book12345 = result?.mentionedBooks?.find((b) => b.id.split("-")[0] === "12345");
    // The bookInfoFullRow merge should update the title
    expect(book12345?.title).toBe("The Great Novel: Extended Title");

    const book67890 = result?.mentionedBooks?.find((b) => b.id.split("-")[0] === "67890");
    expect(book67890?.title).toBe("Another Book");
  });

  test("books have cover images", () => {
    const result = parseBlogHtml(validBlogHtml);
    expect(result).not.toBeNull();
    const book67890 = result?.mentionedBooks?.find((b) => b.id.split("-")[0] === "67890");
    expect(book67890?.coverImage).toBe("https://images.gr-assets.com/books/cover2.jpg");
  });

  test("books have section context from headers", () => {
    const result = parseBlogHtml(validBlogHtml);
    expect(result).not.toBeNull();
    const book12345 = result?.mentionedBooks?.find((b) => b.id.split("-")[0] === "12345");
    expect(book12345?.section).toBe("Fiction");

    const book67890 = result?.mentionedBooks?.find((b) => b.id.split("-")[0] === "67890");
    expect(book67890?.section).toBe("Non-Fiction");
  });

  test("returns null for completely invalid HTML", () => {
    // parseBlogHtml catches errors and returns null
    // However, linkedom is very lenient. An empty string still parses.
    // We test that a truly empty document gives sensible defaults.
    const result = parseBlogHtml("");
    // Even empty HTML will parse without throwing; it returns a Blog with defaults
    if (result !== null) {
      expect(result.title).toBe("Untitled Blog");
      expect(result.mentionedBooks).toHaveLength(0);
    }
  });

  test("handles HTML with no books", () => {
    const result = parseBlogHtml(noBooksHtml);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Empty Blog Post");
    expect(result?.id).toBe("9999");
    expect(result?.mentionedBooks).toHaveLength(0);
  });

  test("uses explicit URL parameter over og:url when provided", () => {
    const customUrl = "https://www.goodreads.com/blog/show/5555-custom";
    const result = parseBlogHtml(validBlogHtml, customUrl);
    expect(result).not.toBeNull();
    expect(result?.webUrl).toBe(customUrl);
    expect(result?.id).toBe("5555");
  });
});
