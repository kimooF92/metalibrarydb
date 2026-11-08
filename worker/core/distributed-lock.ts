import { acquireLockDetailed, releaseLock } from "../../lib/cache-service";

export interface LockExecutionResult<T> {
  acquired: boolean;
  reason?: "unavailable" | "busy";
  result?: T;
}

/**
 * Executes a scrape routine within a distributed Redis lock lease (180s).
 * Guarantees that the lock token is released in the finally block.
 */
export async function withDistributedScrapeLock<T>(
  trackedPageId: string,
  targetDisplayName: string,
  fn: () => Promise<T>
): Promise<LockExecutionResult<T>> {
  const lockKey = `lock:scrape:${trackedPageId}`;
  const lockResult = await acquireLockDetailed(lockKey, 180);

  if (!lockResult.acquired) {
    if (lockResult.reason === "unavailable") {
      console.log(
        `[Worker] ℹ️ Redis lock unavailable (unconfigured or unreachable) for "${targetDisplayName}". Proceeding with local database queue lease.`
      );
    } else {
      console.log(
        `[Worker] 🔒 Page "${targetDisplayName}" is already locked by cloud or another worker. Skipping duplicate scrape.`
      );
      return { acquired: false, reason: "busy" };
    }
  }

  const lockToken = lockResult.acquired ? lockResult.token : undefined;

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    if (lockToken) {
      await releaseLock(lockKey, lockToken).catch(() => {});
    }
  }
}
