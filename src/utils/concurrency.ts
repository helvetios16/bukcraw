/**
 * @file concurrency.ts
 * @description Controlled concurrency utility for parallel processing with a limit.
 */

/**
 * Maps over an array with controlled concurrency, similar to p-map.
 * @param items - The array of items to process.
 * @param mapper - Async function to apply to each item.
 * @param concurrency - Maximum number of concurrent operations.
 * @returns Array of results in the same order as the input.
 */
export async function pMap<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await mapper(item, index);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
