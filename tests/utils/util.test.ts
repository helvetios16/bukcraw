import { describe, expect, test } from "bun:test";
import {
  delay,
  getErrorMessage,
  hashUrl,
  isValidBookId,
  isValidUrl,
} from "../../src/utils/util.ts";

describe("hashUrl", () => {
  test("returns a 32-character hex string for a valid URL", () => {
    const hash = hashUrl("https://www.goodreads.com/book/show/12345");
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  test("returns the same hash for the same input", () => {
    const url = "https://www.goodreads.com/blog/show/100";
    expect(hashUrl(url)).toBe(hashUrl(url));
  });

  test("returns different hashes for different inputs", () => {
    const a = hashUrl("https://www.goodreads.com/a");
    const b = hashUrl("https://www.goodreads.com/b");
    expect(a).not.toBe(b);
  });

  test("throws on empty string", () => {
    expect(() => hashUrl("")).toThrow("Invalid URL provided for hashing");
  });

  test("throws on non-string input", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    expect(() => hashUrl(null as any)).toThrow(
      "Invalid URL provided for hashing",
    );
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    expect(() => hashUrl(undefined as any)).toThrow(
      "Invalid URL provided for hashing",
    );
  });
});

describe("isValidBookId", () => {
  test('accepts numeric ID like "12345"', () => {
    expect(isValidBookId("12345")).toBe(true);
  });

  test('accepts numeric-slug like "12345-some-slug"', () => {
    expect(isValidBookId("12345-some-slug")).toBe(true);
  });

  test('accepts numeric-dot like "12345.Title"', () => {
    expect(isValidBookId("12345.Title")).toBe(true);
  });

  test("rejects empty string", () => {
    expect(isValidBookId("")).toBe(false);
  });

  test("rejects non-numeric start", () => {
    expect(isValidBookId("abc-123")).toBe(false);
  });

  test("rejects only letters", () => {
    expect(isValidBookId("abcdef")).toBe(false);
  });

  test("rejects strings starting with a dash", () => {
    expect(isValidBookId("-12345")).toBe(false);
  });
});

describe("isValidUrl", () => {
  test("accepts a valid http URL", () => {
    expect(isValidUrl("http://example.com")).toBe(true);
  });

  test("accepts a valid https URL", () => {
    expect(isValidUrl("https://www.goodreads.com/book/show/12345")).toBe(true);
  });

  test("rejects a plain string", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });

  test("rejects string with spaces", () => {
    expect(isValidUrl("http://example .com")).toBe(false);
  });
});

describe("getErrorMessage", () => {
  test("returns message from Error instance", () => {
    const err = new Error("something went wrong");
    expect(getErrorMessage(err)).toBe("something went wrong");
  });

  test("returns stringified value for non-Error objects", () => {
    expect(getErrorMessage("string error")).toBe("string error");
  });

  test("returns stringified value for numbers", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  test("returns stringified value for null", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  test("returns stringified value for undefined", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  test("returns stringified value for objects", () => {
    expect(getErrorMessage({ key: "value" })).toBe("[object Object]");
  });
});

describe("delay", () => {
  test("resolves after the specified time", async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  test("returns a Promise that resolves to undefined", async () => {
    const result = await delay(10);
    expect(result).toBeUndefined();
  });
});
