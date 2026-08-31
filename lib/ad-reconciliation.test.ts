import test from "node:test";
import assert from "node:assert/strict";
import type { DB } from "../db";
import {
  isActiveAdArchiveFlag,
  reconcileArchivedAds,
  reconcileZeroResultCount,
  shouldArchiveZeroCount,
} from "./ad-reconciliation";

function createFakeDb(options: { officialPage?: boolean } = {}) {
  const activeRows = options.officialPage === false
    ? null
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
          currentResults: 2,
        }),
      },
      adObservations: {
        findMany: async () => [{ adId: "ad-1" }, { adId: "ad-2" }],
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
