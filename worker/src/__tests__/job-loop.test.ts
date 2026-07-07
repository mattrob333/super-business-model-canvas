import { describe, expect, it } from "vitest";
import { JobLoop } from "../queue/job-loop.js";
import type { AgentJob, ClaimOptions, JobRepository } from "../queue/types.js";

function makeJob(overrides: Partial<AgentJob> = {}): AgentJob {
  return {
    id: "job-1",
    account_id: "account-1",
    kind: "canvas_section_analysis",
    payload: {},
    status: "running",
    attempts: 1,
    max_attempts: 3,
    agent_run_id: null,
    parent_run_id: null,
    cascade_run_id: null,
    claimed_by: "worker-a",
    locked_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    run_after: new Date().toISOString(),
    last_error: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

class MemoryRepository implements JobRepository {
  public completed: string[] = [];
  public failed: Array<{ jobId: string; message: string }> = [];
  public heartbeats: string[] = [];

  constructor(private readonly nextJob: AgentJob | null) {}

  async claimNext(workerId: string, options: ClaimOptions): Promise<AgentJob | null> {
    void workerId;
    void options;
    return this.nextJob;
  }

  async heartbeat(jobId: string): Promise<void> {
    this.heartbeats.push(jobId);
  }

  async complete(jobId: string): Promise<void> {
    this.completed.push(jobId);
  }

  async fail(jobId: string, _workerId: string, error: Error): Promise<void> {
    this.failed.push({ jobId, message: error.message });
  }
}

describe("JobLoop", () => {
  it("claims and completes one job", async () => {
    const repository = new MemoryRepository(makeJob());
    const loop = new JobLoop("worker-a", repository, async () => undefined, {
      pollIntervalMs: 1,
      heartbeatIntervalMs: 1000,
      staleAfterSeconds: 120,
      defaultMaxAttempts: 3,
    });

    await expect(loop.runOnce()).resolves.toBe(true);
    expect(repository.completed).toEqual(["job-1"]);
    expect(repository.failed).toEqual([]);
  });

  it("marks a claimed job failed when the handler throws", async () => {
    const repository = new MemoryRepository(makeJob());
    const loop = new JobLoop(
      "worker-a",
      repository,
      async () => {
        throw new Error("sdk crashed");
      },
      {
        pollIntervalMs: 1,
        heartbeatIntervalMs: 1000,
        staleAfterSeconds: 120,
        defaultMaxAttempts: 3,
      },
    );

    await expect(loop.runOnce()).resolves.toBe(true);
    expect(repository.completed).toEqual([]);
    expect(repository.failed).toEqual([{ jobId: "job-1", message: "sdk crashed" }]);
  });

  it("returns false when no queued or stale running job is claimable", async () => {
    const repository = new MemoryRepository(null);
    const loop = new JobLoop("worker-a", repository, async () => undefined, {
      pollIntervalMs: 1,
      heartbeatIntervalMs: 1000,
      staleAfterSeconds: 120,
      defaultMaxAttempts: 3,
    });

    await expect(loop.runOnce()).resolves.toBe(false);
    expect(repository.completed).toEqual([]);
  });

  it("relies on the repository claim path to reap stale final-attempt jobs", async () => {
    class ReapingRepository extends MemoryRepository {
      public reaped = false;

      async claimNext(workerId: string, options: ClaimOptions): Promise<AgentJob | null> {
        void workerId;
        void options;
        this.reaped = true;
        return null;
      }
    }

    const repository = new ReapingRepository(null);
    const loop = new JobLoop("worker-a", repository, async () => undefined, {
      pollIntervalMs: 1,
      heartbeatIntervalMs: 1000,
      staleAfterSeconds: 120,
      defaultMaxAttempts: 3,
    });

    await expect(loop.runOnce()).resolves.toBe(false);
    expect(repository.reaped).toBe(true);
  });

  it("survives a claim failure — one bad poll must never kill the loop (live incident 2026-07-07)", async () => {
    class FlakyRepository extends MemoryRepository {
      public calls = 0;

      async claimNext(workerId: string, options: ClaimOptions): Promise<AgentJob | null> {
        void workerId;
        void options;
        this.calls += 1;
        if (this.calls === 1) throw new Error("TypeError: fetch failed");
        return null;
      }
    }

    const repository = new FlakyRepository(null);
    const loop = new JobLoop("worker-a", repository, async () => undefined, {
      pollIntervalMs: 1,
      heartbeatIntervalMs: 1000,
      staleAfterSeconds: 120,
      defaultMaxAttempts: 3,
    });

    // Stop after a few cycles; if the first throw escaped, runForever rejects
    // and this await would reject with "fetch failed".
    setTimeout(() => loop.stop(), 20);
    await expect(loop.runForever()).resolves.toBeUndefined();
    expect(repository.calls).toBeGreaterThan(1);
  });
});
