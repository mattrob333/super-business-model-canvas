import type { ClaimOptions, JobHandler, JobRepository } from "./types.js";

export interface JobLoopOptions extends ClaimOptions {
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}

export class JobLoop {
  private stopped = false;

  constructor(
    private readonly workerId: string,
    private readonly repository: JobRepository,
    private readonly handler: JobHandler,
    private readonly options: JobLoopOptions,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async runOnce(): Promise<boolean> {
    const job = await this.repository.claimNext(this.workerId, this.options);
    if (!job) return false;

    const heartbeat = setInterval(() => {
      void this.repository.heartbeat(job.id, this.workerId);
    }, this.options.heartbeatIntervalMs);

    try {
      await this.handler(job);
      await this.repository.complete(job.id, this.workerId);
    } catch (error) {
      await this.repository.fail(job.id, this.workerId, toError(error));
    } finally {
      clearInterval(heartbeat);
    }

    return true;
  }

  async runForever(): Promise<void> {
    while (!this.stopped) {
      const worked = await this.runOnce();
      if (!worked) {
        await sleep(this.options.pollIntervalMs);
      }
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
