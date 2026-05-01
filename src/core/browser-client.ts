// src/core/browser-client.ts

import puppeteer, { type Browser, type Page } from "puppeteer";
import { PUPPETEER_LAUNCH_OPTIONS, USER_AGENT, USER_AGENT_METADATA } from "../config/constants";
import { Logger } from "../utils/logger";

const log = new Logger("Browser");

/**
 * A client to manage the Puppeteer browser instance.
 * It handles launching, anti-detection setup, and closing the browser.
 */
export class BrowserClient {
  private browser: Browser | null = null;

  /**
   * Initializes the browser instance (if not already launched) and returns a new page.
   * @returns A new browser page with anti-detection and optimizations.
   */
  public async launch(): Promise<Page> {
    if (!this.browser) {
      log.info("Starting browser...");
      this.browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTIONS);
    }

    const page = await this.browser.newPage();
    await this.applyAntiDetection(page);
    await this.optimizePage(page);

    return page;
  }

  /**
   * Closes the browser instance.
   */
  public async close(): Promise<void> {
    if (this.browser) {
      log.info("Closing browser...");
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Configures the page to block non-essential resources for faster scraping.
   * @param page - The Puppeteer page to optimize.
   */
  private async optimizePage(page: Page): Promise<void> {
    await page.setRequestInterception(true);

    page.on("request", (request) => {
      const resourceType = request.resourceType();
      const blockedTypes = ["image", "stylesheet", "font", "media", "other"];

      if (blockedTypes.includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  /**
   * Applies anti-detection techniques to a given page.
   * @param page - The Puppeteer page to modify.
   */
  private async applyAntiDetection(page: Page): Promise<void> {
    // Set realistic User-Agent
    await page.setUserAgent({
      userAgent: USER_AGENT,
      userAgentMetadata: USER_AGENT_METADATA,
    });

    // Hide webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
  }
}
