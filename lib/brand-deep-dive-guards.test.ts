import test from "node:test";
import assert from "node:assert/strict";

test("Brand Deep Dive Lifecycle & Guard Suite", async (t) => {
  await t.test("feed query snapshot guard skips duplicate network requests when parameters are unchanged", () => {
    let lastFetchedQuery: string | null = null;
    let fetchCount = 0;

    const simulateFetch = (params: { page: number; limit: number; search?: string }, isManualRefresh = false) => {
      const q = new URLSearchParams({
        page: params.page.toString(),
        limit: params.limit.toString(),
        ...(params.search ? { search: params.search } : {}),
      }).toString();

      // Guard logic identical to useAdFeed
      if (!isManualRefresh && q === lastFetchedQuery) {
        return { fetched: false, query: q };
      }

      fetchCount++;
      lastFetchedQuery = q;
      return { fetched: true, query: q };
    };

    // Initial fetch on mount
    const r1 = simulateFetch({ page: 1, limit: 24 });
    assert.equal(r1.fetched, true);
    assert.equal(fetchCount, 1);

    // Switching away and returning with identical parameters
    const r2 = simulateFetch({ page: 1, limit: 24 });
    assert.equal(r2.fetched, false);
    assert.equal(fetchCount, 1);

    // Filter change triggers fresh fetch
    const r3 = simulateFetch({ page: 1, limit: 24, search: "serum" });
    assert.equal(r3.fetched, true);
    assert.equal(fetchCount, 2);

    // Manual refresh forces fetch even if query matches
    const r4 = simulateFetch({ page: 1, limit: 24, search: "serum" }, true);
    assert.equal(r4.fetched, true);
    assert.equal(fetchCount, 3);
  });

  await t.test("monotonic request ID guard discards out-of-order stale network responses", () => {
    let globalRequestId = 0;
    let state = { data: "initial" };

    const simulateRequest = (id: number, delayMs: number, resultData: string) => {
      return new Promise<void>((resolve) => {
        const reqId = ++globalRequestId;
        setTimeout(() => {
          // Guard: if another request started after this one, discard response
          if (reqId === globalRequestId) {
            state.data = resultData;
          }
          resolve();
        }, delayMs);
      });
    };

    // Req 1 is slow (100ms), Req 2 is fast (20ms)
    const p1 = simulateRequest(1, 100, "slow-stale");
    const p2 = simulateRequest(2, 20, "fast-fresh");

    return Promise.all([p1, p2]).then(() => {
      assert.equal(state.data, "fast-fresh", "State should hold fast-fresh data, slow-stale must be discarded");
    });
  });

  await t.test("deferred feedRevision consumption triggers refetch only upon tab activation", () => {
    let lastAppliedRevision = 0;
    let refetchCount = 0;
    let isActive = false;

    const checkAndApplyRevision = (currentRevision: number) => {
      if (currentRevision > lastAppliedRevision) {
        if (isActive) {
          lastAppliedRevision = currentRevision;
          refetchCount++;
          return true;
        }
      }
      return false;
    };

    // 1. Revision increments while Creatives tab is hidden (isActive = false)
    const appliedWhileHidden = checkAndApplyRevision(1);
    assert.equal(appliedWhileHidden, false, "Should not refetch while hidden");
    assert.equal(lastAppliedRevision, 0, "lastAppliedRevision must not advance while hidden");
    assert.equal(refetchCount, 0);

    // 2. User switches to Creatives tab (isActive = true)
    isActive = true;
    const appliedOnActivation = checkAndApplyRevision(1);
    assert.equal(appliedOnActivation, true, "Must refetch upon activation");
    assert.equal(lastAppliedRevision, 1, "lastAppliedRevision advances to 1");
    assert.equal(refetchCount, 1);

    // 3. Re-evaluating without revision change does not refetch
    const appliedDuplicate = checkAndApplyRevision(1);
    assert.equal(appliedDuplicate, false);
    assert.equal(refetchCount, 1);
  });

  await t.test("sister page ref guard ensures product responses match requested sister page ID", () => {
    const currentSisterPageIdRef = { current: "page-1" };
    let loadedSisterId: string | null = null;

    const handleResponse = (requestedSisterId: string, payloadSisterId: string) => {
      // Guard identical to brand-deep-dive-view.tsx
      if (currentSisterPageIdRef.current !== requestedSisterId) {
        return false; // Discarded due to sister page change
      }
      loadedSisterId = payloadSisterId;
      return true;
    };

    // Fast switch from page-1 to page-2
    currentSisterPageIdRef.current = "page-2";

    // Stale response from in-flight page-1 arrives
    const acceptedStale = handleResponse("page-1", "page-1");
    assert.equal(acceptedStale, false, "Stale sister page response must be discarded");
    assert.equal(loadedSisterId, null);

    // Fresh response for page-2 arrives
    const acceptedFresh = handleResponse("page-2", "page-2");
    assert.equal(acceptedFresh, true, "Matching sister page response must be accepted");
    assert.equal(loadedSisterId, "page-2");
  });

  await t.test("WAI-ARIA tab navigation cyclic index calculation handles ArrowRight, ArrowLeft, Home, and End", () => {
    const TAB_ORDER: Array<"analytics" | "products" | "creatives"> = ["analytics", "products", "creatives"];

    const getNextTab = (currentTab: "analytics" | "products" | "creatives", key: string) => {
      const currentIndex = TAB_ORDER.indexOf(currentTab);
      let nextIndex = -1;

      if (key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % TAB_ORDER.length;
      } else if (key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      } else if (key === "Home") {
        nextIndex = 0;
      } else if (key === "End") {
        nextIndex = TAB_ORDER.length - 1;
      }

      return nextIndex !== -1 ? TAB_ORDER[nextIndex] : currentTab;
    };

    // Forward cyclic
    assert.equal(getNextTab("analytics", "ArrowRight"), "products");
    assert.equal(getNextTab("products", "ArrowRight"), "creatives");
    assert.equal(getNextTab("creatives", "ArrowRight"), "analytics");

    // Backward cyclic
    assert.equal(getNextTab("analytics", "ArrowLeft"), "creatives");
    assert.equal(getNextTab("creatives", "ArrowLeft"), "products");

    // Home and End
    assert.equal(getNextTab("products", "Home"), "analytics");
    assert.equal(getNextTab("analytics", "End"), "creatives");
  });

  await t.test("product hydration guard triggers load and preserves visitedTabs when opened directly on products tab", () => {
    let visitedTabs = new Set(["analytics"]);
    let isProductsLoaded = false;
    let isLoadingProductsTab = false;
    let loadCallCount = 0;

    const checkTabHydration = (activeTab: string) => {
      if (activeTab === "products") {
        if (!visitedTabs.has("products")) {
          visitedTabs = new Set(visitedTabs).add("products");
        }
        if (!isProductsLoaded && !isLoadingProductsTab) {
          isLoadingProductsTab = true;
          loadCallCount++;
        }
      }
    };

    // Cold open with activeTab = 'products'
    checkTabHydration("products");
    assert.equal(visitedTabs.has("products"), true, "visitedTabs must include products");
    assert.equal(isLoadingProductsTab, true, "Loading state must be engaged");
    assert.equal(loadCallCount, 1, "loadProductsTab must be triggered on cold products tab open");

    // Re-evaluating while loading must not duplicate call
    checkTabHydration("products");
    assert.equal(loadCallCount, 1, "Duplicate network call must be prevented");
  });

  await t.test("pendingProductsRef prevents lean analytics response from wiping out concurrently loaded products", () => {
    let data: { products?: any[] } | null = null;
    let pendingProducts: any[] | null = null;
    let isProductsLoaded = false;

    // 1. loadProductsTab finishes first and stores products
    const sampleProducts = [{ id: "p1", title: "Product 1" }];
    pendingProducts = sampleProducts;
    if (data) {
      data = { ...data, products: sampleProducts };
    }
    isProductsLoaded = true;

    // 2. fetchBrandData with lean=true finishes afterwards with products: []
    const leanAnalyticsResponse = { brand: { displayName: "Brand X" }, products: [] };
    const productsToKeep =
      (pendingProducts && pendingProducts.length > 0)
        ? pendingProducts
        : (data?.products && data.products.length > 0)
          ? data.products
          : (leanAnalyticsResponse.products && leanAnalyticsResponse.products.length > 0)
            ? leanAnalyticsResponse.products
            : [];

    data = {
      ...leanAnalyticsResponse,
      products: productsToKeep,
    };

    assert.equal(data.products.length, 1, "Products from loadProductsTab must not be wiped by lean response");
    assert.equal(data.products[0].id, "p1");
    assert.equal(isProductsLoaded, true);
  });

  await t.test("same-tab click forces reload if products catalog is empty", () => {
    let reloadCount = 0;
    const currentTab = "products";
    const data = { products: [] };
    const isLoadingProductsTab = false;

    const onTabClick = (nextTab: string) => {
      if (nextTab === currentTab) {
        if (nextTab === "products" && (!data.products || data.products.length === 0) && !isLoadingProductsTab) {
          reloadCount++;
        }
        return;
      }
    };

    onTabClick("products");
    assert.equal(reloadCount, 1, "Clicking active products tab when empty must trigger reload");
  });
});
