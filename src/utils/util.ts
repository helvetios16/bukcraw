// util.ts

export const delay = async (ms: number): Promise<void> => await Bun.sleep(ms);

const rose = Bun.color([255, 115, 168], "ansi-16m");

export const dumpling = `${rose}bun!\x1b[0m`;

export const hashUrl = (url: string) => {
	const hasher = new Bun.CryptoHasher("md5");
	hasher.update(url);
	return hasher.digest("hex");
};
