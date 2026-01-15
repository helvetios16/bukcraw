// util.ts

export const delay = async (ms: number): Promise<void> => await Bun.sleep(ms);
