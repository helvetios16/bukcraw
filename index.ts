// index.ts

import type { Page } from "puppeteer";
import { BrowserClient } from "./src/core/browser-client";
import { GoodreadsService } from "./src/services/goodreads-service";
import type { ScrapeResult } from "./src/types";

/**
 * Main function to orchestrate the scraping process.
 */
async function main(): Promise<void> {
	const rose = Bun.color([255, 115, 168], "ansi-16m");
	console.log(`${rose}Bun Scraping con Arquitectura en Capas!\x1b[0m`);

	const browserClient = new BrowserClient();
	let page: Page;

	try {
		// 1. Launch the browser and get a page
		page = await browserClient.launch();

		// 2. Initialize the service with the page
		const goodreadsService = new GoodreadsService(page);

		// 3. Execute the scrape and get the result
		const result: ScrapeResult = await goodreadsService.scrape();

		// 4. Log the result
		console.log("\n--- Resultados del Scraping ---");
		console.log(`Título de la página: ${result.title}`);
		console.log(`Longitud del contenido: ${result.contentLength} caracteres`);
		console.log("-----------------------------\n");
	} catch (error) {
		console.error("❌ Ocurrió un error durante el proceso de scraping:", error);
	} finally {
		// 5. Ensure the browser is closed
		await browserClient.close();
		console.log("✨ Proceso completado.");
	}
}

// Execute the main function
main().catch(console.error);
