import { getWorkerState, updateWorkerState } from "./db";

export async function checkBackoffStatus(): Promise<{ inBackoff: boolean; reason?: string }> {
  const state = await getWorkerState();

  if (state.isPaused) {
    return {
      inBackoff: true,
      reason: "Worker is manually paused via kill switch.",
    };
  }

  if (state.backoffUntil) {
    const backoffTime = new Date(state.backoffUntil);
    const now = new Date();

    if (now < backoffTime) {
      const minutesRemaining = Math.ceil(
        (backoffTime.getTime() - now.getTime()) / (1000 * 60)
      );
      return {
        inBackoff: true,
        reason: `Worker in automatic backoff cooldown due to repeated failures (${minutesRemaining} min remaining).`,
      };
    } else {
      // Cooldown expired, clear backoff
      await updateWorkerState({
        backoffUntil: null,
        consecutiveFailures: 0,
      });
    }
  }

  return { inBackoff: false };
}

export async function handleFailure() {
  const state = await getWorkerState();
  const maxConsecutive = parseInt(process.env.MAX_CONSECUTIVE_FAILURES || "3", 10);
  const cooldownMin = parseInt(process.env.BACKOFF_COOLDOWN_MINUTES || "60", 10);

  const newFailures = (state.consecutiveFailures || 0) + 1;
  const now = new Date();

  if (newFailures >= maxConsecutive) {
    const backoffUntil = new Date(now.getTime() + cooldownMin * 60 * 1000);
    await updateWorkerState({
      consecutiveFailures: newFailures,
      lastFailureAt: now,
      backoffUntil,
    });
    console.warn(
      `[Worker Backoff] Threshold hit (${newFailures} consecutive failures). Worker paused until ${backoffUntil.toISOString()}`
    );
  } else {
    await updateWorkerState({
      consecutiveFailures: newFailures,
      lastFailureAt: now,
    });
  }
}

export async function handleSuccess() {
  const state = await getWorkerState();
  if ((state.consecutiveFailures || 0) > 0 || state.backoffUntil !== null) {
    await updateWorkerState({
      consecutiveFailures: 0,
      backoffUntil: null,
    });
  }
}
