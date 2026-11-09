import test from "node:test";
import assert from "node:assert/strict";
import type { DB } from "../db";
import {
  isActiveAdArchiveFlag,
  reconcileArchivedAds,
  reconcileZeroResultCount,
  shouldArchiveZeroCount,
} from "./ad-reconciliation";

function createFakeDb(options: {
  officialPage?: boolean;
  holdStatus?: string | null;
  consecutiveZeroScans?: number | null;
  activeRowsCount?: number;
  lastCreativeScan?: Date | null;
} = {}) {
  const activeRows = options.officialPage === false
    ? null
    : options.activeRowsCount !== undefined
    ? Array.from({ length: options.activeRowsCount }, (_, i) => ({
        id: `ad-${i + 1}`,
        adArchiveId: `archive-${i + 1}`,
        isArchived: false,
      }))
    : [
        { id: "ad-1", adArchiveId: "archive-1", isArchived: false },
        { id: "ad-2", adArchiveId: "archive-2", isArchived: null },
        { id: "ad-3", adArchiveId: "archive-3", isArchived: true },
      ];
  const updates: Array<Record<string, unknown>> = [];
  let insertCount = 0;

  const fakeDb = {
    query: {
      trackedPages: {
        findFirst: async () => ({
          id: "tracked-page-1",
          searchType: options.officialPage === false ? "domain" : "page",
          pageId: options.officialPage === false ? null : "page-1",
          displayName: "Test Page",
          currentResults: options.activeRowsCount ?? 2,
          holdStatus: options.holdStatus ?? "active",
          consecutiveZeroScans: options.consecutiveZeroScans ?? 0,
          holdStartedAt: null,
          lastCreativeScan: options.lastCreativeScan ?? null,
          workspaceId: "00000000-0000-0000-0000-000000000001",
        }),
      },
      adObservations: {
        findMany: async () => (activeRows ? activeRows.map((r) => ({ adId: r.id })) : []),
        findFirst: async () => undefined,
      },
      ads: {
        findMany: async () => {
          if (activeRows === null) {
            throw new Error("Ads query should not run for non-page targets");
          }
          return activeRows.map(({ id, adArchiveId, isArchived }) => ({
            id,
            adArchiveId,
            isArchived,
          }));
        },
      },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push(values);
          if (activeRows && values.isArchived === true) {
            for (const row of activeRows) {
              row.isArchived = true;
            }
          }
        },
      }),
    }),
    insert: () => ({
      values: async () => {
        insertCount += 1;
      },
    }),
  } as unknown as DB;

  return { fakeDb, updates, getInsertCount: () => insertCount };
}

test("archives only successful zero-result count scans", () => {
  assert.equal(shouldArchiveZeroCount("success", 0), true);
  assert.equal(shouldArchiveZeroCount("success", 1), false);
  assert.equal(shouldArchiveZeroCount("success", null), false);
  assert.equal(shouldArchiveZeroCount("unclear", 0), false);
});

test("passes only verified zero-result counts to reconciliation", async () => {
  const calls: Array<{
    trackedPageId: string;
    creativeScanId: string | null;
    observedIds: Set<string>;
    options: { isVerifiedZeroState?: boolean };
  }> = [];
  const reconcile = async (
    trackedPageId: string,
    creativeScanId: string | null,
    observedIds: Set<string>,
    _now: Date,
    options: { isVerifiedZeroState?: boolean }
  ) => {
    calls.push({ trackedPageId, creativeScanId, observedIds, options });
    return { archivedCount: 2 };
  };

  assert.equal(
    await reconcileZeroResultCount(
      "tracked-page-1",
      "success",
      0,
      new Date("2026-08-31T00:00:00.000Z"),
      reconcile
    ),
    2
  );
  assert.equal(
    await reconcileZeroResultCount(
      "tracked-page-1",
      "success",
      1,
      new Date("2026-08-31T00:00:00.000Z"),
      reconcile
    ),
    0
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].creativeScanId, null);
  assert.equal(calls[0].observedIds.size, 0);
  assert.equal(calls[0].options.isVerifiedZeroState, true);
});

test("requires the verified zero-state flag before archiving", async () => {
  const { fakeDb, updates } = createFakeDb();
  const result = await reconcileArchivedAds(
    "tracked-page-1",
    null,
    new Set<string>(),
    new Date("2026-08-31T00:00:00.000Z"),
    { isVerifiedZeroState: false },
    fakeDb
  );

  assert.equal(result.archivedCount, 0);
  assert.equal(updates.length, 0);
});

test("treats false and legacy null archive flags as active", () => {
  assert.equal(isActiveAdArchiveFlag(false), true);
  assert.equal(isActiveAdArchiveFlag(null), true);
  assert.equal(isActiveAdArchiveFlag(undefined), true);
  assert.equal(isActiveAdArchiveFlag(true), false);
});

test("archives all active ads and deactivates observations without a scan record", async () => {
  const { fakeDb, updates, getInsertCount } = createFakeDb();
  const firstRun = await reconcileArchivedAds(
    "tracked-page-1",
    null,
    new Set<string>(),
    new Date("2026-08-31T00:00:00.000Z"),
    { isVerifiedZeroState: true },
    fakeDb
  );

  assert.equal(firstRun.archivedCount, 2);
  assert.equal(updates.filter((update) => update.isArchived === true).length, 1);
  assert.equal(updates.filter((update) => update.isActive === false).length, 2);
  assert.equal(getInsertCount(), 0);
});

test("is idempotent when a zero-page reconciliation has no active ads left", async () => {
  const { fakeDb, updates } = createFakeDb();
  await reconcileArchivedAds(
    "tracked-page-1",
    null,
    new Set<string>(),
    new Date("2026-08-31T00:00:00.000Z"),
    { isVerifiedZeroState: true },
    fakeDb
  );
  const updateCountAfterFirstRun = updates.length;

  const secondRun = await reconcileArchivedAds(
    "tracked-page-1",
    null,
    new Set<string>(),
    new Date("2026-08-31T00:00:01.000Z"),
    { isVerifiedZeroState: true },
    fakeDb
  );

  assert.equal(secondRun.archivedCount, 0);
  assert.equal(updates.length, updateCountAfterFirstRun);
});

test("does not archive ads for non-page targets", async () => {
  const { fakeDb, updates } = createFakeDb({ officialPage: false });
  const result = await reconcileArchivedAds(
    "tracked-page-1",
    null,
    new Set<string>(),
    new Date("2026-08-31T00:00:00.000Z"),
    { isVerifiedZeroState: true },
    fakeDb
  );

  assert.equal(result.archivedCount, 0);
  assert.equal(updates.length, 0);
});

test("shouldArchiveZeroCount respects on_hold grace period", () => {
  // Grace period scan 1 and 2 must NOT archive
  assert.equal(shouldArchiveZeroCount("success", 0, "on_hold", 1), false);
  assert.equal(shouldArchiveZeroCount("success", 0, "on_hold", 2), false);
  // Scan 3 confirms shutdown and allows archival
  assert.equal(shouldArchiveZeroCount("success", 0, "on_hold", 3), true);
  assert.equal(shouldArchiveZeroCount("success", 0, "inactive", 3), true);
  // Normal non-hold legacy scan without hold parameters archives as before
  assert.equal(shouldArchiveZeroCount("success", 0), true);
  // Unclear or non-zero never archives
  assert.equal(shouldArchiveZeroCount("unclear", 0, "on_hold", 3), false);
  assert.equal(shouldArchiveZeroCount("success", 5, "on_hold", 3), false);
});

test("reconcileZeroResultCount skips archival during on_hold grace period", async () => {
  let called = false;
  const reconcile = async () => {
    called = true;
    return { archivedCount: 5 };
  };

  const archived1 = await reconcileZeroResultCount(
    "page-1",
    "success",
    0,
    new Date(),
    reconcile,
    "on_hold",
    1
  );
  assert.equal(archived1, 0);
  assert.equal(called, false);

  const archivedConfirmed = await reconcileZeroResultCount(
    "page-1",
    "success",
    0,
    new Date(),
    reconcile,
    "inactive",
    3
  );
  assert.equal(archivedConfirmed, 5);
  assert.equal(called, true);
});

test("reconcileArchivedAds protects on_hold page from premature ad wiping", async () => {
  const { fakeDb, updates } = createFakeDb({ holdStatus: "on_hold", consecutiveZeroScans: 1 });
  const result = await reconcileArchivedAds(
    "tracked-page-1",
    null,
    new Set<string>(), // 0 observed ads
    new Date("2026-08-31T00:00:00.000Z"),
    { isVerifiedZeroState: true },
    fakeDb
  );

  assert.equal(result.archivedCount, 0);
  assert.equal(updates.length, 0); // No ads archived
});

test("reconcileArchivedAds correctly archives missing ads for official page target without UUID query", async () => {
  const { fakeDb, updates } = createFakeDb({ officialPage: true, holdStatus: "active" });
  const result = await reconcileArchivedAds(
    "tracked-page-uuid",
    "scan-1",
    new Set<string>(["archive-1"]), // archive-2 is missing
    new Date("2026-08-31T00:00:00.000Z"),
    { isFullScan: true },
    fakeDb
  );

  assert.equal(result.archivedCount, 1);
  assert.equal(updates.some((u) => u.isArchived === true), true);
  assert.equal(updates.some((u) => u.isActive === false), true);
});

test("reconcileArchivedAds prevents premature archival on sudden cliff drop (>70% drop)", async () => {
  // Brand with 50 active ads suddenly observes only 2 ads (96% drop)
  const { fakeDb, updates } = createFakeDb({
    officialPage: true,
    activeRowsCount: 50,
    holdStatus: "active",
    consecutiveZeroScans: 0,
  });

  const result = await reconcileArchivedAds(
    "tracked-page-uuid",
    "scan-1",
    new Set<string>(["archive-1", "archive-2"]), // Only 2 ads observed
    new Date("2026-08-31T00:00:00.000Z"),
    { isFullScan: true },
    fakeDb
  );

  // Must NOT archive on first drop; should place on hold
  assert.equal(result.archivedCount, 0);
  assert.equal(updates.some((u) => u.isArchived === true), false);
  assert.equal(updates.some((u) => u.holdStatus === "on_hold"), true);
  assert.equal(updates.some((u) => u.consecutiveZeroScans === 1), true);
});

test("reconcileArchivedAds confirms cliff drop after consecutive scans", async () => {
  // Already seen 2 consecutive cliff drops (consecutiveZeroScans = 2)
  const { fakeDb, updates } = createFakeDb({
    officialPage: true,
    activeRowsCount: 50,
    holdStatus: "on_hold",
    consecutiveZeroScans: 2,
  });

  const result = await reconcileArchivedAds(
    "tracked-page-uuid",
    "scan-3",
    new Set<string>(["archive-1", "archive-2"]),
    new Date("2026-08-31T00:00:00.000Z"),
    { isFullScan: true },
    fakeDb
  );

  // Third consecutive scan confirms drop -> archives 48 missing ads
  assert.equal(result.archivedCount, 48);
  assert.equal(updates.some((u) => u.isArchived === true), true);
  assert.equal(updates.some((u) => u.holdStatus === "active"), true);
  assert.equal(updates.some((u) => u.consecutiveZeroScans === 0), true);
});

test("reconcileArchivedAds recovers hold status if observed count returns to normal", async () => {
  // Was on hold, but brand now observes 48 ads (normal)
  const { fakeDb, updates } = createFakeDb({
    officialPage: true,
    activeRowsCount: 50,
    holdStatus: "on_hold",
    consecutiveZeroScans: 1,
  });

  const observed = new Set(Array.from({ length: 48 }, (_, i) => `archive-${i + 1}`));
  const result = await reconcileArchivedAds(
    "tracked-page-uuid",
    "scan-2",
    observed,
    new Date("2026-08-31T00:00:00.000Z"),
    { isFullScan: true },
    fakeDb
  );

  // Only 2 missing ads archived, holdStatus reset to active
  assert.equal(result.archivedCount, 2);
  assert.equal(updates.some((u) => u.holdStatus === "active"), true);
  assert.equal(updates.some((u) => u.consecutiveZeroScans === 0), true);
});

test("reconcileArchivedAds ignores stale out-of-order scans", async () => {
  const newerScanDate = new Date("2026-08-31T12:00:00.000Z");
  const olderScanDate = new Date("2026-08-31T10:00:00.000Z"); // 2 hours older

  const { fakeDb, updates } = createFakeDb({
    officialPage: true,
    activeRowsCount: 5,
    lastCreativeScan: newerScanDate,
  });

  const result = await reconcileArchivedAds(
    "tracked-page-uuid",
    "stale-scan",
    new Set<string>(["archive-1"]),
    olderScanDate, // Out-of-order timestamp
    { isFullScan: true },
    fakeDb
  );

  // Out-of-order scan must be skipped
  assert.equal(result.archivedCount, 0);
  assert.equal(updates.length, 0);
});

