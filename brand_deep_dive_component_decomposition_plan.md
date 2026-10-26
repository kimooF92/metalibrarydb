# Brand Deep Dive Component Decomposition - Implementation Plan

**Date:** 2026-10-26
**Status:** Approved & Implemented
**Parent feature:** Next.js Intercepting Route & Deep Dive Performance Refactor
**Related plan:** [brand_deep_dive_intercepting_route_plan.md](brand_deep_dive_intercepting_route_plan.md)
**Baseline Verification:** Compiles cleanly with TypeScript (`tsc --noEmit`), builds cleanly (`next build`), and passes all 180 existing automated unit/integration tests (`npm test`). The intercepting route overlay and initial lifecycle patches are committed on `main` (commits `a4777a1` and `004402f`).

---

## 1. Executive Summary & Objective

The objective is to decompose the monolithic `components/spy/brand-deep-dive-view.tsx` (~2,330 lines) into focused, maintainable domain components:
- Header & Status presentation (`BrandDeepDiveHeader`)
- Tab navigation bar (`BrandDeepDiveTabs`)
- Analytics overview (`AnalyticsTab`)
- Product catalog & sync actions (`ProductsTab`)
- Creative feed & filters (`CreativesTab`)

### Primary Goals
1. **Maintain Dual Route Contracts**: Support identical presentation and behavior in standalone route (`/spy/brand/[id]`) and intercepted slide-over modal (`@modal/(.)spy/brand/[id]`).
2. **Isolate Component Re-renders**: Localize search and filter state (e.g. `productSearch`, `feedSearch`, `feedSortBy`) inside their respective tab components so user input does not re-evaluate the full deep-dive tree.
3. **Lazy First-Mount with Preserved Inactive Tabs**: Inactive tabs do not mount or fetch data until first activated (zero initial mount/fetch cost). Once visited, tabs remain mounted using `display: none` (`hidden`) to avoid unnecessary remount-driven network requests and maintain loaded feed items.
4. **Fix Existing Lifecycle & Network Leaks**:
   - Prevent `useAdFeed` from re-fetching when returning to an already-loaded Creatives tab.
   - Add request-generation IDs to `useAdFeed` to eliminate async race conditions.
   - Resolve the stale-closure bug in sister-page product loading.
   - Implement exact `scrollTop` capture and restoration in `BrandOverlaySheet`.
   - Update the "Open Full Window" link to reliably include active tab query parameters.
5. **Keep Boundaries Cohesive**: Avoid 14-file micro-hook sprawl. Maintain clear state ownership between the parent orchestration shell and child tabs.

---

## 2. Current Verified Baseline (Commits on Main)

The Next.js intercepting route structure and initial hardening patches are currently in the codebase (commits `a4777a1` and `004402f`):
- **Parallel + Intercepting Route Layout**: `app/@modal/(.)spy/brand/[id]/page.tsx` renders `<BrandOverlaySheet>` wrapping `<BrandDeepDiveView>`.
- **Top Control Bar**: `BrandOverlaySheet` displays brand name and ad count badge via `useBrandOverlay()` context.
- **Timer Cleanup**: `statusTimeoutRef` in `BrandDeepDiveView` clears the 45-second scan safety timeout on unmount and on scan completion.
- **Child Dialog Escape Isolation**: `ProductDetailsModal` stops event propagation on Escape, and `BrandOverlaySheet` checks for open child dialogs before dismissing itself.
- **Tab History in Modal Mode**: `BrandDeepDiveView` uses `window.history.replaceState` when `isModal=true` to keep the browser history stack shallow.

*Note on UI Verification*: These changes have been verified via TypeScript compilation, Next.js production builds, and manual browser checks. Formal automated browser/UI test coverage is specified in Section 7.

---

## 3. Target Architecture & Module Breakdown

```text
app/spy/brand/[id]/page.tsx (Standalone Route)
app/@modal/(.)spy/brand/[id]/page.tsx (Intercepted Modal Route)
        |
        v
BrandDeepDiveView (Orchestration Shell)
  |-- BrandDeepDiveHeader (Brand identity, status, scan actions, sister pages)
  |-- BrandDeepDiveTabs (Accessible tablist with counts)
  |-- AnalyticsTab (Executive metrics, charts, distributions, portfolio)
  |-- ProductsTab (Product catalog, filters, sync/rescan, details modal)
  \-- CreativesTab (useAdFeed, creative filters, view mode, infinite scroll)
```

### Module Responsibilities

1. **`BrandDeepDiveView` (`components/spy/brand-deep-dive-view.tsx`)**
   - Coordinates route mode (`isModal`, `onClose`).
   - Owns primary brand data fetch (`/api/spy/brand/[id]`) and canonical product state.
   - Tracks active tab and lazy first-mount set (`visitedTabs`).
   - Orchestrates cross-tab state bridges (sister-page selection, creative product filtering, product sync revalidation).
   - Manages top-level child modals (Export Dossier, Manage Domain, Product Details).

2. **`BrandDeepDiveHeader` (`components/spy/brand-deep-dive-header.tsx`)**
   - Brand logo, page title, URL, country badge, and tracking status.
   - Verified ad count and both scan timestamps (`lastChecked` count verification date, `lastCreativeScan` deep scrape date).
   - Watchlist toggle and on-demand Meta Ad Library scan trigger button.
   - Sister-page / brand portfolio dropdown selector.

3. **`BrandDeepDiveTabs` (`components/spy/brand-deep-dive-tabs.tsx`)**
   - Accessible ARIA tablist (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`).
   - Tab buttons for Analytics, Products, and Creatives with badge counts.
   - Pulse dot indicator on Creatives tab when a product filter is active.

4. **`AnalyticsTab` (`components/spy/analytics-tab.tsx`)**
   - Executive metric cards (Active Footprint, Scale Momentum, Evergreen Ratio, Product Depth).
   - Historical scaling trajectory velocity chart.
   - Launch velocity and commercial strategy pricing summaries.
   - Media distribution, longevity distribution, and CTA distribution progress bars.
   - Sister-page / domain portfolio table.
   - Flagship product cluster spotlight.
   - *Memoization*: Wrapped in `React.memo` with narrow props to prevent re-renders when other tabs update.

5. **`ProductsTab` (`components/spy/products-tab.tsx`)**
   - Local search and filter controls: title/URL search, status filter (`all`/`scraped`/`pending`), offer-only, and active-only.
   - Batch product sync and unified rescan dropdown actions.
   - Product cards grid and table list views.
   - Callbacks to parent for product detail modal and "View Ads" creative bridge.
   - *Memoization*: Wrapped in `React.memo` so typing in creative filters does not re-render products.

6. **`CreativesTab` (`components/spy/creatives-tab.tsx`)**
   - Integrates `useAdFeed` for scoped ad retrieval.
   - Local feed controls: media type, status, sort order, and keyword search.
   - View mode toggle (grid vs. list).
   - Active product filter banner with "Clear Filter" button.
   - Infinite scroll intersection observer sentinel and loading skeletons.
   - *Memoization*: Wrapped in `React.memo` so parent state changes do not re-render heavy creative cards.

---

## 4. State Ownership & Canonical Contracts

To avoid duplicate sources of truth or stale closures, state ownership is explicitly assigned:

### 4.1 Canonical Data Ownership
- **Brand & Product Data**: Owned canonically by `BrandDeepDiveView` (`data`, `data.products`).
  - Reason: Tab counts (`BrandDeepDiveTabs`), executive metrics (`AnalyticsTab`), and header badges all require product totals.
  - `ProductsTab` receives `products: ScrapedProduct[]` as a prop and uses callbacks (`onLoadProducts`, `onUpdateProducts`) to notify the parent of updates.
- **Feed Data**: Owned by `CreativesTab` via `useAdFeed`.
  - Reason: Feed pagination, cursor state, and card deduplication are local to creative browsing.

### 4.2 Cross-Tab State Bridges

#### Bridge 1: Sister-Page Scope (`selectedSisterPageId`)
- **Owner**: `BrandDeepDiveView`.
- **Trigger**: User selects a sister page from the dropdown in `BrandDeepDiveHeader`.
- **Contract**:
  1. Parent updates `selectedSisterPageId` and a ref `currentSisterPageIdRef.current = targetSisterId`.
  2. Parent triggers `fetchBrandData(true, targetSisterId)`.
  3. If Products tab has been visited, parent invokes product catalog reload passing `targetSisterId`.
  4. Parent passes `selectedSisterPageId` to `CreativesTab`, which forwards it to `useAdFeed`.

#### Bridge 2: Filter Creatives by Product (`filteredProductForCreatives`)
- **Owner**: `BrandDeepDiveView`.
- **Trigger**: User clicks "View Ads" on a card in `ProductsTab`.
- **Contract**:
  ```ts
  onFilterCreativesByProduct: (product: { id: string; title: string; url: string }) => void
  ```
  1. Parent stores `{ id, title, url }` in `filteredProductForCreatives`.
  2. Parent switches `activeTab` to `"creatives"`.
  3. `CreativesTab` forwards `productId: filteredProductForCreatives.id` to `useAdFeed` and renders the filter banner.
  4. User clicking "Clear Filter" calls `onClearProductFilter()`, resetting parent state to `null`.

#### Bridge 3: Product Sync Revalidation (`feedRevision` contract)
- **Owner**: `BrandDeepDiveView`.
- **Trigger**: User runs product batch sync in `ProductsTab`.
- **Contract**:
  ```ts
  feedRevision: number
  onProductSyncSuccess: () => Promise<void>
  ```
  1. `ProductsTab` completes `/api/spy/brand/[id]/products/sync`.
  2. `ProductsTab` calls `onProductSyncSuccess()`.
  3. Parent revalidates primary brand summary (`fetchBrandData(true)`).
  4. Parent increments `setFeedRevision((r) => r + 1)`.
  5. `CreativesTab` receives `feedRevision`. A `useEffect` watching `feedRevision` triggers `refetchFeed()` when `feedRevision > 0`.

---

## 5. Lifecycle, Network, and Rendering Fixes

### 5.1 Prevent Creative Re-fetching on Tab Switching
- **Issue**: `useAdFeed` currently re-runs `fetchFeed(false)` whenever `params.enabled` transitions from `false` to `true`, causing an unnecessary network fetch every time the user returns to the Creatives tab.
- **Fix**:
  In `hooks/use-spy.ts` (or the wrapper in `CreativesTab`):
  1. Maintain a ref of last-fetched parameters: `lastFetchedParamsRef`.
  2. When `params.enabled` becomes `true`:
     - Compare current query parameters (`trackedPageId`, `sisterPageId`, `search`, `mediaType`, `status`, `sortBy`, `productId`) against `lastFetchedParamsRef.current`.
     - If parameters have not changed and items are already loaded (`ads.length > 0`), skip calling `fetchFeed()`.
     - Only fetch if parameters have changed or if an explicit manual refresh is requested.

### 5.2 Add Request-Generation IDs to `useAdFeed`
- **Issue**: `fetchFeed` aborts the previous `AbortController`, but does not use a request ID. In fast filter-switching scenarios, a race condition can cause an older request to write state.
- **Fix**:
  1. Add `requestIdRef = useRef(0)` in `useAdFeed`.
  2. At the start of `fetchFeed`, increment `const currentReqId = ++requestIdRef.current`.
  3. Before calling `setAds` or `setPagination`, check `if (currentReqId !== requestIdRef.current) return;`.

### 5.3 Stale-Closure Resolution in Sister-Page Product Loading
- **Issue**: In `brand-deep-dive-view.tsx`, `handleSisterPageSelect` sets `selectedSisterPageId` and immediately calls `loadProductsTab(true, targetSisterId)`. The completion guard checks `selectedSisterPageId !== requestedSisterPageId`. Because state updates are asynchronous, the stale closure value discards the valid response.
- **Fix**:
  1. Remove `selectedSisterPageId !== requestedSisterPageId` from the async response callback.
  2. Rely on the existing monotonic request ID guard: `if (currentReqId !== productsRequestIdRef.current) return;`.
  3. Maintain `currentSisterPageIdRef.current = targetSisterId` for synchronous reference.

### 5.4 Exact Scroll Restoration in `BrandOverlaySheet`
- **Issue**: `BrandOverlaySheet` locks `overflow = "hidden"` on `<main>` and background `.overflow-y-auto` containers, but does not record or restore their `scrollTop`. In some layout reflows, `scrollTop` can be lost.
- **Fix**:
  In `components/spy/brand-overlay-sheet.tsx`:
  1. Capture scroll positions alongside overflow:
     ```ts
     const scrollStates: { el: HTMLElement; overflow: string; scrollTop: number }[] = [];
     backgroundScrollEls.forEach((el) => {
       scrollStates.push({ el, overflow: el.style.overflow, scrollTop: el.scrollTop });
       el.style.overflow = "hidden";
     });
     ```
  2. Restore both on unmount:
     ```ts
     return () => {
       scrollStates.forEach(({ el, overflow, scrollTop }) => {
         el.style.overflow = overflow;
         el.scrollTop = scrollTop;
       });
     };
     ```

### 5.5 Reliable "Open Full Window" Query String
- **Issue**: `BrandOverlaySheet` listens to `popstate` to update `currentSearch`. Because tab changes use `history.replaceState` (which does not fire `popstate`), `currentSearch` remains stale.
- **Fix**:
  In `BrandOverlaySheet`, compute `fullWindowUrl` dynamically at click time:
  ```tsx
  <a
    href={brandId ? `/spy/brand/${encodeURIComponent(brandId)}${typeof window !== "undefined" ? window.location.search : ""}` : "#"}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => {
      // Re-evaluate target href at click time to guarantee current tab query param
      e.currentTarget.href = `/spy/brand/${encodeURIComponent(brandId)}${window.location.search}`;
    }}
  >
  ```

### 5.6 Inactive Tab Rendering Strategy
- **Implementation**:
  ```tsx
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set([initialTab]));

  const handleTabChange = (nextTab: Tab) => {
    setVisitedTabs((prev) => (prev.has(nextTab) ? prev : new Set(prev).add(nextTab)));
    setActiveTab(nextTab);
    // ... history and container scroll management
  };
  ```
  Render:
  ```tsx
  {visitedTabs.has("analytics") && (
    <div id="tabpanel-analytics" role="tabpanel" className={activeTab === "analytics" ? "space-y-5" : "hidden"}>
      <AnalyticsTab {...analyticsProps} />
    </div>
  )}
  {visitedTabs.has("products") && (
    <div id="tabpanel-products" role="tabpanel" className={activeTab === "products" ? "space-y-4" : "hidden"}>
      <ProductsTab {...productsProps} />
    </div>
  )}
  {visitedTabs.has("creatives") && (
    <div id="tabpanel-creatives" role="tabpanel" className={activeTab === "creatives" ? "space-y-4" : "hidden"}>
      <CreativesTab {...creativesProps} />
    </div>
  )}
  ```

---

## 6. Execution Phases

### Phase 1: Fix Core Lifecycle & Network Bugs
- Apply `scrollTop` capture/restore in `BrandOverlaySheet`.
- Fix click-time query string resolution for "Open Full Window".
- Add request-generation ID guard and duplicate-fetch prevention to `useAdFeed` in `hooks/use-spy.ts`.
- Fix the sister-page product load response guard in `BrandDeepDiveView`.
- *Verification*: Confirm `tsc --noEmit` passes and existing tests remain green.

### Phase 2: Extract Navigation & Header
- Create `components/spy/brand-deep-dive-header.tsx`.
- Create `components/spy/brand-deep-dive-tabs.tsx`.
- Integrate into `BrandDeepDiveView`.
- *Verification*: Header identity, scan dates, watchlist toggle, scan button, and tab selection work identically.

### Phase 3: Extract Analytics Tab
- Create `components/spy/analytics-tab.tsx`.
- Wrap in `React.memo`. Pass computed metrics and distributions as props.
- *Verification*: Metrics cards, historical trajectory chart, distributions, and domain portfolio render correctly.

### Phase 4: Extract Products Tab
- Create `components/spy/products-tab.tsx`.
- Move local filter state (`productSearch`, `productStatusFilter`, etc.), scrape menu, and product cards grid.
- Connect canonical product data props and `onFilterCreativesByProduct` callback.
- Wrap in `React.memo`.
- *Verification*: Products load on first tab activation, search filtering is responsive, sync toast fires, and detail modal opens.

### Phase 5: Extract Creatives Tab
- Create `components/spy/creatives-tab.tsx`.
- Move `useAdFeed` integration, local feed filters (`mediaType`, `status`, `sortBy`), view mode toggle, and infinite scroll sentinel.
- Connect `feedRevision` prop and product filter banner.
- Wrap in `React.memo`.
- *Verification*: Feed loads on first activation, infinite scroll loads page 2, switching tabs does not re-fetch page 1, and clearing product filter works.

### Phase 6: Implement Lazy First-Mount & Shell Cleanup
- Implement `visitedTabs` in `BrandDeepDiveView`.
- Clean up unused imports, dead handlers, and redundant state variables from `BrandDeepDiveView`.
- Ensure clean code formatting.

### Phase 7: Verification & Browser Testing
- Run TypeScript check: `node '.\node_modules\typescript\bin\tsc' --noEmit`.
- Run automated unit/integration tests: `npm test` (180 tests pass).
- Run production build: `node '.\node_modules\next\dist\bin\next' build`.
- Execute the Manual Browser Verification Protocol (Section 7).

---

## 7. Verification & Testing Protocol

### 7.1 Automated Suite
- `npm test`: Validates all 180 backend and library tests (circuit breaker, product validation, reconciliation, caching).
- `tsc --noEmit`: Confirms strict type compliance across all new component interfaces.
- `next build`: Validates production bundle generation and server/client boundary integrity.

### 7.2 Manual Browser Verification Protocol
Because the workspace does not currently have a Playwright UI test runner configured in `package.json`, the following manual test protocol must be completed at desktop (1280px+) and mobile (390px) viewports:

1. **Tracker Scroll Preservation**:
   - Scroll the main tracker table down to row 50+.
   - Click a brand row to open the intercepted overlay.
   - Verify the background table does not jump to `0,0`.
   - Close overlay (via `ESC`, backdrop, or `[X]`).
   - Verify the table remains at the exact row and scroll position.
2. **Tab Switching & Request Avoidance**:
   - Open brand overlay (starts on Analytics).
   - In DevTools Network tab, observe initial brand fetch.
   - Click "Products" tab: verify `/api/spy/brand/[id]?scope=products` fires once.
   - Click "Creatives" tab: verify `/api/spy/ads?...` fires once for page 1.
   - Click back to "Analytics", then back to "Creatives": verify **no new network request** fires for creatives.
3. **Product-to-Creative Filter Bridge**:
   - In Products tab, click "View Ads" on any product card.
   - Verify active tab switches to "Creatives".
   - Verify blue pulse banner displays *"Filtered by Product: [Title]"*.
   - Click "Clear Filter": verify feed resets and banner disappears.
4. **Product Sync Revalidation**:
   - In Products tab, trigger "Sync Brand Products".
   - On completion, verify toast notification appears, header distinct product count updates, and creative feed updates without full remount.
5. **Nested Dialog Escape Hierarchy**:
   - In Products tab, click a product to open `ProductDetailsModal`.
   - Press `Escape`: verify only `ProductDetailsModal` closes, and the overlay remains open.
   - Press `Escape` again: verify the overlay closes and returns to the tracker table.
6. **Open Full Window Tab Preservation**:
   - Switch to "Products" tab in the overlay.
   - Click "Open Full Window".
   - Verify the opened new tab URL includes `?tab=products`.
7. **Standalone Direct Route**:
   - Open `/spy/brand/[id]?tab=creatives` directly in address bar (hard navigation).
   - Verify standalone layout renders directly on the Creatives tab with full functionality.

### 7.3 Future E2E Automation Target
To automate the protocol above, a subsequent infrastructure task can install `@playwright/test` and configure `tests/e2e/brand-deep-dive.spec.ts` covering the 7 scenarios.

---

## 8. Definition of Done

- All 5 modular domain components created and exported under `components/spy/`.
- `BrandDeepDiveView` acts strictly as an orchestration shell with no duplicate state.
- Inactive tabs do not mount or issue network requests on initial page load (`visitedTabs` guard).
- Returning to an already-loaded Creatives tab does not trigger a duplicate network request.
- `useAdFeed` incorporates a monotonic request ID guard.
- Sister-page selection reloads products without stale-closure response drops.
- `BrandOverlaySheet` captures and restores `scrollTop` of background scroll containers.
- "Open Full Window" link reflects the current active tab query parameter.
- Tab components wrapped in `React.memo` with localized search/filter inputs.
- All 180 backend tests, TypeScript check, and Next.js production build pass with zero errors.
- Manual browser verification protocol passes at both desktop and mobile viewports.
