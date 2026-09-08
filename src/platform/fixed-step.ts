interface FixedStepClockOptions {
  tickRate: number;
  maxFrameSeconds: number;
  step: () => void;
}

/** Frame timestamps affect only how many fixed simulation ticks are run. */
export class FixedStepClock {
  private remainder = 0;
  private previous: number | null = null;

  constructor(private readonly options: FixedStepClockOptions) {}
  reset(): void {
    this.remainder = 0;
    this.previous = null;
  }

  advance(timestamp: number): void {
    if (this.previous === null) {
      this.previous = timestamp;

      return;
    }

    const elapsed = Math.max(
      0,
      Math.min((timestamp - this.previous) / 1000, this.options.maxFrameSeconds),
    );
    this.previous = timestamp;
    this.remainder += elapsed;

    const interval = 1 / this.options.tickRate;

    while (this.remainder + Number.EPSILON >= interval) {
      this.options.step();
      this.remainder -= interval;
    }
  }
}
