import { getWorkerState, updateWorkerState } from "./db";
import { redis } from "../lib/redis";

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

function getHourKey(date = new Date()): string {
  return `scan_cap:hour:${date.toISOString().slice(0, 13)}`;
}

function getDayKey(date = new Date()): string {
  return `scan_cap:day:${date.toISOString().slice(0, 10)}`;
}

export async function checkRateCaps(): Promise<{ allowed: boolean; reason?: string }> {
  const maxHour = parseInt(process.env.MAX_SCANS_PER_HOUR || "0", 10);
  const maxDay = parseInt(process.env.MAX_SCANS_PER_DAY || "0", 10);

  // If no limits configured, pass immediately without touching Redis or DB
  if (maxHour <= 0 && maxDay <= 0) {
    return { allowed: true };
  }

  // 1. Fast Redis check via single pipelined round-trip (eliminates high-frequency DB waterfall)
  if (redis) {
    try {
      const pipe = redis.pipeline();
      if (maxHour > 0) pipe.get<number>(getHourKey());
      if (maxDay > 0) pipe.get<number>(getDayKey());

      const results = await pipe.exec<number[]>();
      let idx = 0;

      if (maxHour > 0) {
        const hourCount = results[idx++] || 0;
        if (hourCount >= maxHour) {
          return {
            allowed: false,
            reason: `Hourly scan cap reached (${hourCount}/${maxHour}). Waiting for hourly window reset.`,
          };
        }
      }

      if (maxDay > 0) {
        const dayCount = results[idx++] || 0;
        if (dayCount >= maxDay) {
          return {
            allowed: false,
            reason: `Daily scan cap reached (${dayCount}/${maxDay}). Waiting for daily window reset.`,
          };
        }
      }

      return { allowed: true };
    } catch (err: any) {
      console.warn("[Throttle] Redis checkRateCaps error, falling back to DB state:", err?.message || err);
    }
  }

  // 2. Fallback to PostgreSQL worker_state
  const state = await getWorkerState();
  const now = new Date();

  // Check hourly window
  const hourStart = state.hourWindowStart ? new Date(state.hourWindowStart) : now;
  const isNewHour = now.getTime() - hourStart.getTime() > 60 * 60 * 1000;

  if (isNewHour) {
    await updateWorkerState({
      scansThisHour: 0,
      hourWindowStart: now,
    });
  } else if (maxHour > 0 && (state.scansThisHour || 0) >= maxHour) {
    return {
      allowed: false,
      reason: `Hourly scan cap reached (${state.scansThisHour}/${maxHour}). Waiting for hourly window reset.`,
    };
  }

  // Check daily window (skipped if maxDay <= 0 for unlimited)
  const dayStart = state.dayWindowStart ? new Date(state.dayWindowStart) : now;
  const isNewDay = now.getTime() - dayStart.getTime() > 24 * 60 * 60 * 1000;

  if (isNewDay) {
    await updateWorkerState({
      scansToday: 0,
      dayWindowStart: now,
    });
  } else if (maxDay > 0 && (state.scansToday || 0) >= maxDay) {
    return {
      allowed: false,
      reason: `Daily scan cap reached (${state.scansToday}/${maxDay}). Waiting for daily window reset.`,
    };
  }

  return { allowed: true };
}

export async function recordSuccessfulScan() {
  // 1. Atomic Redis pipelined increment & TTL in 1 single HTTP request (zero risk of orphaned unexpired keys)
  if (redis) {
    try {
      const hourKey = getHourKey();
      const dayKey = getDayKey();

      const pipe = redis.pipeline();
      pipe.incr(hourKey);
      pipe.expire(hourKey, 7200); // 2 hours
      pipe.incr(dayKey);
      pipe.expire(dayKey, 172800); // 48 hours
      await pipe.exec();
      return;
    } catch (err: any) {
      console.warn("[Throttle] Redis recordSuccessfulScan error, falling back to DB:", err?.message || err);
    }
  }

  // 2. Fallback to PostgreSQL
  const state = await getWorkerState();
  await updateWorkerState({
    scansThisHour: (state.scansThisHour || 0) + 1,
    scansToday: (state.scansToday || 0) + 1,
  });
}

