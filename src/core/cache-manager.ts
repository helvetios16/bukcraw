import { mkdir } from "node:fs/promises";
import { hashUrl } from "../utils/util";

export class CacheManager {
	cacheDir: string;

	constructor(cacheDir = "./.cache") {
		this.cacheDir = cacheDir;
		mkdir(this.cacheDir, { recursive: true }).catch(() => {});
	}

	public async save(url: string, content: string, force = false) {
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
