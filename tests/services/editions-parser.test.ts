import { describe, expect, test } from "bun:test";
import {
  extractPaginationInfo,
  parseEditionsHtml,
  parseEditionsList,
} from "../../src/services/editions-parser.ts";

const editionsFixtureHtml = `
<html><body>
<select name="sort">
  <option value="">Sort</option>
  <option value="num_ratings" selected>Most Popular</option>
  <option value="date_pub_edition_desc">Newest</option>
</select>
<select name="filter_by_format">
  <option value="">All Formats</option>
  <option value="Kindle Edition">Kindle Edition</option>
  <option value="Paperback">Paperback</option>
</select>
<select name="filter_by_language">
  <option value="">All Languages</option>
  <option value="spa">Spanish</option>
  <option value="eng">English</option>
</select>
<div class="elementList">
  <div class="leftAlignedImage"><img src="https://images.gr-assets.com/books/ed1.jpg"></div>
  <a class="bookTitle" href="/book/show/111-edition-one">Edition One</a>
  <div class="editionData">
    <div class="dataRow">Row 1</div>
    <div class="dataRow">Published 2020 by Publisher A</div>
    <div class="dataRow">Paperback, 300 pages</div>
  </div>
  <div class="moreDetails">
    <div class="dataRow"><div class="dataTitle">Edition language:</div><div class="dataValue">Spanish</div></div>
    <div class="dataRow"><div class="dataTitle">Average rating:</div><div class="dataValue">4.50 (1,234 ratings)</div></div>
  </div>
</div>
<div class="elementList">
  <div class="leftAlignedImage"><img src="https://images.gr-assets.com/books/ed2.jpg"></div>
  <a class="bookTitle" href="/book/show/222-edition-two">Edition Two</a>
  <div class="editionData">
    <div class="dataRow">Row 1</div>
    <div class="dataRow">Published March 2021 by Publisher B</div>
    <div class="dataRow">Kindle Edition, 280 pages</div>
  </div>
  <div class="moreDetails">
    <div class="dataRow"><div class="dataTitle">Edition language:</div><div class="dataValue">English</div></div>
    <div class="dataRow"><div class="dataTitle">Average rating:</div><div class="dataValue">3.80 (567 ratings)</div></div>
  </div>
</div>
<div class="pagination">
  <em class="current">1</em>
  <a href="?page=2">2</a>
  <a href="?page=3">3</a>
  <a class="next_page" href="?page=2">next</a>
</div>
</body></html>
`;

const noPaginationHtml = `
<html><body>
<div class="elementList">
  <a class="bookTitle" href="/book/show/333-solo-edition">Solo Edition</a>
  <div class="editionData">
    <div class="dataRow">Row 1</div>
    <div class="dataRow">Published 2019</div>
    <div class="dataRow">Hardcover, 200 pages</div>
  </div>
</div>
</body></html>
`;

describe("parseEditionsList", () => {
  test("extracts correct number of editions", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions).toHaveLength(2);
  });

  test("first edition has correct title", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.title).toBe("Edition One");
  });

  test("first edition has correct link", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.link).toBe("/book/show/111-edition-one");
  });

  test("first edition has correct coverImage", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.coverImage).toBe("https://images.gr-assets.com/books/ed1.jpg");
  });

  test("first edition has format Paperback", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.format).toBe("Paperback");
  });

  test("first edition has 300 pages", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.pages).toBe(300);
  });

  test("first edition has language Spanish", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.language).toBe("Spanish");
  });

  test("first edition has averageRating 4.50", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.averageRating).toBe(4.5);
  });

  test("first edition has publisher Publisher A", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.publisher).toBe("Publisher A");
  });

  test("first edition has publishedDate 2020", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    expect(editions[0]?.publishedDate).toBe("2020");
  });

  test("second edition has correct data", () => {
    const editions = parseEditionsList(editionsFixtureHtml);
    const second = editions[1];
    expect(second?.title).toBe("Edition Two");
    expect(second.link).toBe("/book/show/222-edition-two");
    expect(second.coverImage).toBe("https://images.gr-assets.com/books/ed2.jpg");
    expect(second.format).toBe("Kindle Edition");
    expect(second.pages).toBe(280);
    expect(second.language).toBe("English");
    expect(second.averageRating).toBe(3.8);
    expect(second.publisher).toBe("Publisher B");
    expect(second.publishedDate).toBe("March 2021");
  });

  test("returns empty array for HTML with no .elementList", () => {
    const html = "<html><body><p>No editions here</p></body></html>";
    const editions = parseEditionsList(html);
    expect(editions).toHaveLength(0);
  });

  test("returns empty array for empty string", () => {
    const editions = parseEditionsList("");
    expect(editions).toHaveLength(0);
  });
});

describe("parseEditionsHtml", () => {
  test("extracts sort options", () => {
    const filters = parseEditionsHtml(editionsFixtureHtml);
    expect(filters).not.toBeNull();
    const sortValues = filters?.sort.map((o) => o.value);
    expect(sortValues).toContain("num_ratings");
    expect(sortValues).toContain("date_pub_edition_desc");
  });

  test("sort option has selected flag", () => {
    const filters = parseEditionsHtml(editionsFixtureHtml);
    expect(filters).not.toBeNull();
    const selected = filters?.sort.find((o) => o.selected);
    expect(selected).toBeDefined();
    expect(selected?.value).toBe("num_ratings");
    expect(selected?.label).toBe("Most Popular");
  });

  test("extracts format options", () => {
    const filters = parseEditionsHtml(editionsFixtureHtml);
    expect(filters).not.toBeNull();
    const formatValues = filters?.format.map((o) => o.value);
    expect(formatValues).toContain("Kindle Edition");
    expect(formatValues).toContain("Paperback");
  });

  test("extracts language options", () => {
    const filters = parseEditionsHtml(editionsFixtureHtml);
    expect(filters).not.toBeNull();
    const langValues = filters?.language.map((o) => o.value);
    expect(langValues).toContain("spa");
    expect(langValues).toContain("eng");
  });

  test("filters out empty value options (placeholders)", () => {
    const filters = parseEditionsHtml(editionsFixtureHtml);
    expect(filters).not.toBeNull();
    // The empty "" value options ("Sort", "All Formats", "All Languages") should be excluded
    const allValues = [
      ...(filters?.sort.map((o) => o.value) ?? []),
      ...(filters?.format.map((o) => o.value) ?? []),
      ...(filters?.language.map((o) => o.value) ?? []),
    ];
    expect(allValues).not.toContain("");
  });

  test("returns filters object for HTML with no select elements", () => {
    const html = "<html><body><p>No selects</p></body></html>";
    const filters = parseEditionsHtml(html);
    // Function returns an object with empty arrays when selects are missing
    expect(filters).not.toBeNull();
    expect(filters?.sort).toHaveLength(0);
    expect(filters?.format).toHaveLength(0);
    expect(filters?.language).toHaveLength(0);
  });
});

describe("extractPaginationInfo", () => {
  test("detects total pages from fixture", () => {
    const info = extractPaginationInfo(editionsFixtureHtml);
    expect(info.totalPages).toBe(3);
  });

  test("hasNextPage is true when next_page link exists", () => {
    const info = extractPaginationInfo(editionsFixtureHtml);
    expect(info.hasNextPage).toBe(true);
  });

  test("returns defaults for HTML with no pagination", () => {
    const info = extractPaginationInfo(noPaginationHtml);
    expect(info.hasNextPage).toBe(false);
    expect(info.totalPages).toBe(1);
  });

  test("returns defaults for empty string", () => {
    const info = extractPaginationInfo("");
    expect(info.hasNextPage).toBe(false);
    expect(info.totalPages).toBe(1);
  });
});
