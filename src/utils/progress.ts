/**
 * @file progress.ts
 * @description Simple CLI progress indicator with optional ETA.
 */

export class Progress {
  private readonly total: number;
  private current = 0;
  private lastTickTime = 0;
  private lastDuration = 0;
  private tickDurations: number[] = [];
  private readonly windowSize = 5;

  constructor(total: number) {
    this.total = total;
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.ceil(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  tick(label = ""): void {
    const now = Date.now();

    if (this.lastTickTime > 0) {
      this.lastDuration = (now - this.lastTickTime) / 1000;
      this.tickDurations.push(this.lastDuration);
      if (this.tickDurations.length > this.windowSize) {
        this.tickDurations.shift();
      }
    }
    this.lastTickTime = now;
    this.current++;

    const avgTime =
      this.tickDurations.length > 0
        ? this.tickDurations.reduce((a, b) => a + b, 0) / this.tickDurations.length
        : 0;
    const remaining = Math.ceil(avgTime * (this.total - this.current));

    const durationStr = this.lastDuration > 0 ? ` [${this.formatTime(this.lastDuration)}]` : "";
    const eta = this.current < this.total ? ` ~${this.formatTime(remaining)} left` : " done";
    const labelStr = label ? ` ${label}` : "";

    process.stdout.write(
      `\r[${this.current}/${this.total}]${labelStr}${durationStr}${eta}${"".padEnd(10)}`,
    );

    if (this.current >= this.total) {
      process.stdout.write("\n");
    }
  }
}
