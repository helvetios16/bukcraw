// src/services/goodreads-service.ts

import type { Page } from "puppeteer";
import { GOODREADS_URL } from "../config/constants";
import type { ScrapeResult } from "../types";
import { delay } from "../utils/util";

/**
 * Service responsible for scraping data from Goodreads.
 */
export class GoodreadsService {
	private page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	/**
	 * Navigates to Goodreads and extracts data.
	 * @returns A promise that resolves with the scraped data.
	 */
	public async scrape(): Promise<ScrapeResult> {
		console.log(" navegando a Goodreads...");
		await this.page.goto(GOODREADS_URL, { waitUntil: "domcontentloaded" });
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
}
