import { getWorkerState, updateWorkerState } from "./db";

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const DELAY_CONFIG = {
  beforeNavMin: parseInt(process.env.WORKER_DELAY_MIN || "2000", 10),
  beforeNavMax: parseInt(process.env.WORKER_DELAY_MAX || "5000", 10),
  afterLoadMin: 1000,
  afterLoadMax: 3000,
  beforeExtractMin: 500,
  beforeExtractMax: 1500,
  beforeNextPageMin: 3000,
  beforeNextPageMax: 8000,
};

export async function checkRateCaps(): Promise<{ allowed: boolean; reason?: string }> {
  const state = await getWorkerState();
  const now = new Date();

  const maxHour = parseInt(process.env.MAX_SCANS_PER_HOUR || "20", 10);
  const maxDay = parseInt(process.env.MAX_SCANS_PER_DAY || "150", 10);

  // Check hourly window
  const hourStart = state.hourWindowStart ? new Date(state.hourWindowStart) : now;
  const isNewHour = now.getTime() - hourStart.getTime() > 60 * 60 * 1000;

  if (isNewHour) {
    await updateWorkerState({
      scansThisHour: 0,
      hourWindowStart: now,
    });
  } else if ((state.scansThisHour || 0) >= maxHour) {
    return {
      allowed: false,
      reason: `Hourly scan cap reached (${state.scansThisHour}/${maxHour}). Waiting for hourly window reset.`,
    };
  }

  // Check daily window
  const dayStart = state.dayWindowStart ? new Date(state.dayWindowStart) : now;
  const isNewDay = now.getTime() - dayStart.getTime() > 24 * 60 * 60 * 1000;

  if (isNewDay) {
    await updateWorkerState({
      scansToday: 0,
      dayWindowStart: now,
    });
  } else if ((state.scansToday || 0) >= maxDay) {
    return {
      allowed: false,
      reason: `Daily scan cap reached (${state.scansToday}/${maxDay}). Waiting for daily window reset.`,
    };
  }

  return { allowed: true };
}

export async function recordSuccessfulScan() {
  const state = await getWorkerState();
  await updateWorkerState({
    scansThisHour: (state.scansThisHour || 0) + 1,
    scansToday: (state.scansToday || 0) + 1,
  });
}
