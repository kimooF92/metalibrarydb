/**
 * Backward-compatible barrel re-export bridge for worker database and domain services.
 * Decomposed into modular domain repositories and services:
 * - repositories/scan-history-repo: purgeOldRawExtracts
 * - repositories/worker-state-repo: getAppSettings, getWorkerState, updateWorkerState
 * - repositories/discovery-run-repo: claimNextPendingDiscoveryRun, markDiscoveryJobCompleted, markDiscoveryJobFailed
 * - repositories/creative-scan-repo: markCreativeJobCompleted, markCreativeJobFailed
 * - repositories/tracked-page-repo: enqueuePagesForCreativeScan, saveExtractedPageIdsToDiscovery
 * - repositories/queue-repo: claimNextPendingJob, getNextPendingJob, markJobRunning, markJobFailed, resetStuckJobs, enqueueOrEscalateJob, enqueueAllPagesForRefresh
 * - services/apify-delta-service: hasActiveApifyDeltaTasks, waitForApifyDeltaQueueDrain, tryAutoTriggerApifyDeltaScan
 * - services/scan-completion-service: markJobCompleted
 */

export * from "./repositories/scan-history-repo";
export * from "./repositories/worker-state-repo";
export * from "./repositories/discovery-run-repo";
export * from "./repositories/creative-scan-repo";
export * from "./repositories/tracked-page-repo";
export * from "./repositories/queue-repo";
export * from "./services/apify-delta-service";
export * from "./services/scan-completion-service";
