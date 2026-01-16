/**
 * @file goodreads-service.ts
 * @description Service responsible for navigating Goodreads and extracting book information.
 */

import type { Page } from "puppeteer";
import { GOODREADS_URL } from "../config/constants";
import { CacheManager } from "../core/cache-manager";
import type { Book, ScrapeResult } from "../types";
import { delay, isValidBookId } from "../utils/util";

/**
 * Service responsible for scraping data from Goodreads.
 */
export class GoodreadsService {
	private readonly page: Page;
	private readonly cache = new CacheManager();

	constructor(page: Page) {
		this.page = page;
	}

	/**
	 * Navigates to Goodreads and extracts data.
	 * @returns A promise that resolves with the scraped data.
	 */
	public async scrapeTest(): Promise<ScrapeResult> {
		console.log(" navegando a Goodreads...");
		await this.page.goto(GOODREADS_URL, { waitUntil: "load" });
		console.log("✅ Navegación completada.");

		// Wait for client-side JavaScript to finish executing
		await delay(2000);

		console.log(" extrayendo datos...");
		const title = await this.page.title();
		const content = await this.page.content();

		console.log("✅ Datos extraídos.");

		return {
			title,
			contentLength: content.length,
		};
	}

	/**
	 * Navigates to Goodreads and extracts book data.
	 * @param id The Goodreads book ID (e.g. "12345-book-title")
	 * @returns A promise that resolves with the book data.
	 * @throws Error if the ID is invalid or critical data cannot be found.
	 */
	public async lookBook(id: string): Promise<Book> {
		if (!isValidBookId(id)) {
			throw new Error(`Invalid Book ID format: ${id}`);
		}

		const url = `${GOODREADS_URL}/book/show/${id}`;
		console.log(` Buscando libro ${id}...`);

		const cachedContent = await this.cache.get(url);

		if (cachedContent) {
			console.log(`✓ Encontrado en caché: ${id}`);
			await this.page.setContent(cachedContent);
		} else {
			console.log(` Navegando a Goodreads: ${url}`);
			await this.page.goto(url, { waitUntil: "domcontentloaded" });

			await this.page.waitForSelector("body");
			console.log(`✅ Página cargada.`);

			const content = await this.page.content();
			await this.cache.save(url, content);
		}

		console.log(" Extrayendo datos del DOM...");

		const title = await this.extractText("h1");
		if (!title) {
			throw new Error("Failed to extract book title - selector 'h1' not found or empty.");
		}

		return {
			title,
			author: (await this.extractText(".authorName")) || "Unknown Author",
			language: (await this.extractText("[itemprop='inLanguage']")) || "Unknown Language",
		};
	}

	/**
	 * Helper to safely extract text content from a selector.
	 */
	private async extractText(selector: string): Promise<string | null> {
		try {
			return await this.page.$eval(selector, (el) => el.textContent?.trim() ?? null);
		} catch {
			return null;
		}
	}
}
