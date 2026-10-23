export const OPPORTUNITY_AI_MODEL = "minimax/minimax-m3.1-flash";
export const OPPORTUNITY_SCHEMA_VERSION = "opportunities.v2" as const;
export const OPPORTUNITY_TIMEOUT_MS = 25000; // 25s timeout per stage (strict limit to avoid 120s route timeout)
export const MAX_PIPELINE_TIMEOUT_MS = 65000; // 65s global budget across all pipeline stages
export const OPPORTUNITY_MAX_TOKENS = 4000;
export const TELEMETRY_WINDOW_DAYS = 30;
