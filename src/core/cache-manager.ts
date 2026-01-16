import { mkdir } from "node:fs/promises";
import { hashUrl } from "../utils/util";

export class CacheManager {
	cacheDir: string;

	constructor(cacheDir: string = "./.cache") {
		this.cacheDir = cacheDir;
	}

	public async save(url: string, content: string, force: boolean = false): Promise<string> {
		const filename = `${this.cacheDir}/${hashUrl(url)}.html`;
		const file = Bun.file(filename);

		if (!force && (await file.exists())) {
			console.log(`✓ Cache hit: ${url}`);
			return filename;
		}

		console.log(`↓ Cache: ${url}`);

		await Bun.write(file, content);

		return filename;
	}
}
