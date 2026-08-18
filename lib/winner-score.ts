export interface WinnerCalculationInput {
  startedRunningOn?: string | Date | null;
  firstSeenAt?: string | Date | null;
  lastSeenAt?: string | Date | null;
  duplicationCount?: number;
  isActive?: boolean | null;
  isArchived?: boolean | null;
  mediaType?: string | null;
}

export interface WinnerCalculationResult {
  winnerScore: number;
  winnerTier: "super" | "high" | "promising" | "testing";
  isBreakout: boolean;
  isEvergreen: boolean;
  daysRunning: number;
  breakdown: {
    longevityPts: number;
    scalePts: number;
    recencyPts: number;
    bonusPts: number;
  };
}

/**
 * Calculates a standardized Winner Score (0–100) and flags high-velocity ads.
 */
export function calculateWinnerScore(input: WinnerCalculationInput): WinnerCalculationResult {
  const now = Date.now();

  // 1. Calculate Days Running
  let launchTimestamp: number | null = null;
  if (input.startedRunningOn) {
    const t = new Date(input.startedRunningOn).getTime();
    if (!isNaN(t)) launchTimestamp = t;
  }
  if (!launchTimestamp && input.firstSeenAt) {
    const t = new Date(input.firstSeenAt).getTime();
    if (!isNaN(t)) launchTimestamp = t;
  }

  const daysRunning = launchTimestamp
    ? Math.max(0, Math.floor((now - launchTimestamp) / (1000 * 60 * 60 * 24)))
    : 0;

  // 2. Longevity Score (0 - 40 pts)
  let longevityPts = 0;
  if (daysRunning === 0) longevityPts = 4;
  else if (daysRunning <= 3) longevityPts = 8;
  else if (daysRunning <= 7) longevityPts = 16;
  else if (daysRunning <= 14) longevityPts = 25;
  else if (daysRunning <= 30) longevityPts = 34;
  else if (daysRunning <= 90) longevityPts = 40;
  else longevityPts = 38; // Slight decay for extremely old ads

  // 3. Duplication / Scale Score (0 - 40 pts)
  const dup = Math.max(1, Number(input.duplicationCount || 1));
  let scalePts = 0;
  if (dup === 1) scalePts = 5;
  else if (dup === 2) scalePts = 14;
  else if (dup <= 4) scalePts = 24;
  else if (dup <= 8) scalePts = 32;
  else if (dup <= 15) scalePts = 37;
  else scalePts = 40;

  // 4. Recency & Active Status (0 - 15 pts)
  const isActive = input.isActive !== false && !input.isArchived;
  let recencyPts = 0;
  if (isActive) {
    let lastSeenDiffHours = 0;
    if (input.lastSeenAt) {
      const lastSeenT = new Date(input.lastSeenAt).getTime();
      if (!isNaN(lastSeenT)) {
        lastSeenDiffHours = Math.floor((now - lastSeenT) / (1000 * 60 * 60));
      }
    }
    if (lastSeenDiffHours <= 48) {
      recencyPts = 15;
    } else if (lastSeenDiffHours <= 168) {
      recencyPts = 10;
    } else {
      recencyPts = 6;
    }
  } else {
    recencyPts = 2; // Inactive or archived ad
  }

  // 5. Velocity & Media Bonuses (0 - 5 pts)
  let bonusPts = 0;
  // Fast scale velocity bonus (scaled to 3+ copies within 7 days)
  if (isActive && daysRunning <= 7 && dup >= 3) {
    bonusPts += 4;
  }
  // Video production bonus
  if (input.mediaType === "video") {
    bonusPts += 1;
  }
  bonusPts = Math.min(5, bonusPts);

  // Total raw score
  let rawScore = longevityPts + scalePts + recencyPts + bonusPts;

  // Modifiers
  if (input.isArchived) {
    rawScore = Math.round(rawScore * 0.7);
  } else if (!isActive) {
    rawScore = Math.round(rawScore * 0.8);
  }

  const winnerScore = Math.min(100, Math.max(1, Math.round(rawScore)));

  // Breakout: Newly launched (<= 7 days) with high duplication (>= 3)
  const isBreakout = Boolean(isActive && daysRunning <= 7 && dup >= 3);

  // Evergreen: Running for 30+ days with solid scale (>= 2 copies)
  const isEvergreen = Boolean(isActive && daysRunning >= 30 && dup >= 2);

  // Tier classification
  let winnerTier: "super" | "high" | "promising" | "testing" = "testing";
  if (winnerScore >= 85) {
    winnerTier = "super";
  } else if (winnerScore >= 68) {
    winnerTier = "high";
  } else if (winnerScore >= 45) {
    winnerTier = "promising";
  }

  return {
    winnerScore,
    winnerTier,
    isBreakout,
    isEvergreen,
    daysRunning,
    breakdown: {
      longevityPts,
      scalePts,
      recencyPts,
      bonusPts,
    },
  };
}
