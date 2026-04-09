/**
 * @file progress.ts
 * @description Simple CLI progress indicator with optional ETA.
 */

export class Progress {
  private readonly total: number;
  private readonly startTime: number;
  private current = 0;

  constructor(total: number) {
    this.total = total;
    this.startTime = Date.now();
  }

  /**
   * Updates the progress to the next item and writes the status to stdout.
   * @param label - Optional label to display alongside the progress.
   */
  tick(label = ""): void {
    this.current++;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const avgTime = elapsed / this.current;
    const remaining = Math.ceil(avgTime * (this.total - this.current));

    const eta = this.current < this.total ? ` ~${remaining}s left` : " done";
    const labelStr = label ? ` ${label}` : "";

    process.stdout.write(`\r[${this.current}/${this.total}]${labelStr}${eta}${"".padEnd(10)}`);

    if (this.current >= this.total) {
      process.stdout.write("\n");
    }
  }
}
