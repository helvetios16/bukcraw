import puppeteer, { type Browser, type Page } from "puppeteer";
import { delay } from "./utils/util";

const rose: string | null = Bun.color([255, 115, 168], "ansi-16m");
console.log(`${rose}Bun!\x1b[0m`);

const scrape = async (): Promise<void> => {
	console.log("Starting browser...");

	const browser: Browser = await puppeteer.launch({
		headless: true, // Run browser without visible window (faster, for production)
		args: [
			"--no-sandbox", // Disable Chrome's sandbox security feature (needed for some environments like Docker/CI)
			"--disable-setuid-sandbox", // Another sandbox-related flag for compatibility
			"--disable-dev-shm-usage", // Prevent shared memory issues on Linux/limited RAM systems
			"--disable-blink-features=AutomationControlled", // Hide the fact that browser is being controlled by automation (anti-detection)
		],
	});

	try {
		console.log("Browser started!");

		// Create new tab/page
		const page: Page = await browser.newPage();

		// ===== ANTI-DETECTION TECHNIQUES =====

		// Set realistic User-Agent to mimic a real Chrome browser
		// Without this, default User-Agent reveals it's Puppeteer/automated
		await page.setUserAgent({
			userAgent:
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
			userAgentMetadata: {
				brands: [
					{ brand: "Google Chrome", version: "131" },
					{ brand: "Chromium", version: "131" },
					{ brand: "Not_A Brand", version: "24" },
				],
				fullVersion: "131.0.0.0",
				platform: "Windows",
				platformVersion: "10.0.0",
				architecture: "x86",
				model: "",
				mobile: false,
			},
		});

		// Hide webdriver property that websites check to detect bots
		// navigator.webdriver is normally 'true' in automated browsers
		// This makes it 'undefined' or 'false' to appear like a real user
		await page.evaluateOnNewDocument(() => {
			Object.defineProperty(navigator, "webdriver", { get: () => false });
		});

		// ===== NAVIGATE TO WEBSITE =====

		console.log("Navigating to Goodreads...");

		await page.goto("https://www.goodreads.com", {
			// Wait until DOM is loaded (fast option)
			// Other options: 'load', 'networkidle0', 'networkidle2'
			waitUntil: "domcontentloaded",
		});

		// ===== EXTRACT DATA =====

		// Wait 2 seconds to let JavaScript finish executing
		// Important because some content loads after DOM is ready
		await delay(2000);

		// Get the page title (what shows in browser tab)
		const title: string = await page.title();
		console.log(`Title: ${title}`);

		// Get entire HTML content of the page
		// Useful for debugging or searching for specific data
		const content: string = await page.content();
		console.log(`Page content length: ${content.length} characters`);
	} catch (error) {
		console.error("An error occurred during scraping:", error);
	} finally {
		// ===== CLEANUP =====

		await delay(2000); // Optional wait before closing (for debugging)

		// Close browser and free up memory
		await browser.close();

		console.log("Done!");
	}
};

scrape().catch(console.error);
