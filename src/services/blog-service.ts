import { BLOG_URL, GOODREADS_URL } from "../config/constants";
import { type Blog, isBlog } from "../types";
import { Logger } from "../utils/logger";
import { getErrorMessage } from "../utils/util";
import { BaseScraperService } from "./base-scraper";
import { parseBlogHtml } from "./blog-parser";

const log = new Logger("BlogService");

export class BlogService extends BaseScraperService {
  /**
   * Scrapes a Goodreads blog and stores its reference in the database.
   */
  public async scrapeBlog(id: string): Promise<Blog | null> {
    const url = `${GOODREADS_URL}${BLOG_URL}${id}`;
    log.info(`Scraping blog ${id}...`);

    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        const parsed: unknown = JSON.parse(cachedParsed);
        if (!isBlog(parsed)) {
          log.warn("Cached blog data is invalid, re-fetching...");
          throw new Error("Invalid cached blog data");
        }
        const blogData = parsed;
        this.saveBlogReferences(id, blogData);
        return blogData;
      }
    } catch (error: unknown) {
      log.debug("Blog cache miss:", getErrorMessage(error));
    }

    const { content } = await this.fetchContentWithFallback(url);
    await this.cache.save({ url, content, force: false, extension: ".html" });

    const blogData = parseBlogHtml(content, url);
    if (blogData) {
      await this.cache.save({
        url,
        content: JSON.stringify(blogData, null, 2),
        force: true,
        extension: "-parsed.json",
      });
      log.info(`Blog parsed (${blogData.mentionedBooks?.length || 0} books found).`);
      this.saveBlogReferences(id, blogData);
    } else {
      log.warn("Failed to parse blog content.");
    }

    return blogData;
  }

  private saveBlogReferences(blogId: string, blogData: Blog): void {
    if (blogData.mentionedBooks) {
      for (const book of blogData.mentionedBooks) {
        this.db.saveBlogReference({
          blogId,
          bookId: book.id,
          blogTitle: blogData.title,
          blogUrl: blogData.webUrl,
        });
      }
    }
  }
}
