# Brand Deep Dive Component Decomposition — Implementation Plan

**Date:** 2026-10-26  
**Status:** Draft / Ready for implementation after modal merge  
**Parent feature:** Next.js intercepting route for Brand Deep Dive  
**Related plan:** [brand_deep_dive_intercepting_route_plan.md](brand_deep_dive_intercepting_route_plan.md)  
**Review context:** The modal implementation compiles, builds, and passes the existing 180 automated tests. This plan addresses maintainability, rendering cost, and modal safety without changing the route contract.

## 1. Objective

Decompose `components/spy/brand-deep-dive-view.tsx` into focused components and hooks so that the Brand Deep Dive remains smooth in both standalone and intercepted-modal modes.

The decomposition must preserve:

- The existing standalone route: `/spy/brand/[id]`.
- The intercepted modal route: `/spy/brand/[id]` during soft navigation.
- Brand analytics, product, and creative data contracts.
- Tab URL semantics and modal history behavior.
- Existing Supabase/API quota protections.
- Backdrop, close-button, and browser-back behavior.
- The tracker table remaining mounted behind the modal.

## 2. Why this refactor is needed

The current shared view is approximately 2,300 lines and combines:

- Page-level orchestration and route state.
- Primary brand-data fetching and revalidation.
- Product loading, filtering, syncing, refreshing, and deletion.
- Creative-feed filtering and infinite-scroll behavior.
- Watchlist and scan actions.
- Three large tab panels.
- Product, dossier, domain, and sister-page modals.

The component also keeps all three tab panels in the React tree and hides inactive panels with CSS. This can leave expensive product cards, creative cards, filters, and derived calculations mounted even when the user is viewing another tab.

The target is not maximum file fragmentation. The target is clear ownership of state and render boundaries so inactive work can be avoided and each area can be tested independently.

## 3. Merge strategy

### 3.1 Modal merge first

The intercepting-route work should merge as its own change after the modal-critical fixes listed in Section 5. Do not combine the full decomposition with the routing merge.

This keeps the routing change reviewable and makes it possible to identify whether a regression comes from routing or component restructuring.

### 3.2 Decomposition second

The decomposition should follow as a separate refactor series. Each step must keep the public `BrandDeepDiveView` API stable:

```tsx
<BrandDeepDiveView
  id={id}
  isModal={true | false}
  onClose={optionalCloseHandler}
/>
```

The route wrappers and `BrandOverlaySheet` should not need to know how analytics, products, or creatives are internally rendered.

## 4. Target architecture

```text
app/spy/brand/[id]/page.tsx
app/@modal/(.)spy/brand/[id]/page.tsx
        |
        v
BrandDeepDiveView                 # orchestration and shared shell
├── useBrandTabState              # URL, history, active-tab scroll
├── useBrandDeepDiveData          # primary brand data and revalidation
├── useBrandActions               # scan, watchlist, sister-page actions
├── BrandDeepDiveHeader           # identity, scan state, actions
├── BrandDeepDiveTabs             # tablist and counts
├── AnalyticsTab                  # analytics-only rendering
├── ProductsTab                   # product loading, filters, grid/list
├── CreativesTab                  # creative feed and filters
└── BrandDeepDiveModals           # child modal orchestration
    ├── ProductDetailsModal
    ├── ExportDossierModal
    ├── ManageDomainModal
    └── SisterPageSelector
```

### 4.1 Architectural invariants

These rules prevent the extracted units from drifting:

1. `BrandDeepDiveView` remains the only component that coordinates route mode, shared brand identity, active tab, and top-level modal state.
2. Data hooks own requests, abort controllers, request IDs, loading states, and error states. Presentational components do not issue ad hoc fetches.
3. Each tab owns only its local filters and view preferences unless state must survive route changes or be shared with another tab.
4. The active tab is rendered; inactive tabs are unmounted unless a specific interaction requires preserving their live DOM state.
5. Tab data may remain cached in the parent hook after unmount. Unmounting a tab must not discard already-loaded data.
6. Modal and standalone modes use the same data and rendering components. Mode-specific behavior is limited to scrolling, history, close behavior, and layout.
7. Existing server/API contracts remain unchanged during this refactor. New endpoints are out of scope.
8. List and feed components must use explicit, lean data projections and must not introduce `SELECT *`, heavy JSON fetches, or unbounded API loops.
9. Every asynchronous request must have cancellation or request-generation protection, and every timer/subscription must have cleanup.
10. Child dialogs must close before the Brand Deep Dive overlay and must own their Escape behavior.

## 4.2 Redis and cache infrastructure alignment

The decomposition is aligned with the current Upstash Redis infrastructure as long as Redis remains a server-side concern. The refactor must not introduce a new cache client, new key namespace, or direct Redis access from browser components.

Current infrastructure boundaries to preserve:

- `lib/cache-service.ts` remains the only cache/lock abstraction used by the Brand Deep Dive API routes.
- `lib/redis.ts` remains server-side and continues to provide graceful degradation when Upstash credentials are unavailable.
- Brand responses continue to use the tenant-safe key pattern `cache:brand:{workspaceId}:{canonicalBrandId}:{sisterPageId}:...`.
- Product-only responses continue to use the existing `:products` mode suffix.
- Brand cold-miss protection continues to use the matching `lock:brand:...` key and the existing lock ownership checks.
- Existing TTLs, L1 memory limits, 400 KB payload protection, and cursor-bounded prefix invalidation remain unchanged.
- The database-backed queue remains the source of truth for queued work. Redis is not used as a replacement queue by this refactor.
- Scan progress continues to be read through `/api/scan-progress`; the browser must not read `scan_step:*` keys directly.

Redis-specific implementation rules:

1. `useBrandDeepDiveData`, `useBrandProducts`, and `useBrandCreatives` call existing API routes only. They do not import `@upstash/redis`, `lib/redis`, or `lib/cache-service`.
2. Products-tab lazy loading must call the existing products-only brand endpoint mode so the server can use the `:products` cache key. Tab activation must not append `_t` or `refresh=true` unless the user explicitly requested a refresh.
3. Each tab hook must deduplicate its own in-flight request for the same brand, workspace, sister-page filter, and mode. Switching tabs quickly must not create an unbounded request burst.
4. The parent view must not mount a second scan-progress polling loop. If progress is needed, reuse the existing progress widget/context and its bounded polling behavior.
5. Mutation handlers continue to call the existing invalidating API routes. The client must not guess or manually delete Redis keys.
6. Realtime updates and Redis cache invalidation remain separate concerns: realtime may prompt a bounded client revalidation, but it must not force-refresh on every event.
7. Any new server-side endpoint required by the refactor must use explicit database projections, bounded limits, mandatory TTLs, and the existing cache-service helpers.

Redis acceptance checks:

- Opening the overlay and switching tabs does not create direct browser-to-Redis traffic.
- A normal tab switch reuses server cache paths and does not bypass Redis with a forced refresh.
- Repeated tab activation is deduplicated and does not create parallel identical requests.
- Product sync, product refresh, ad-library scans, and creative refreshes still invalidate through their existing server routes.
- Upstash-unavailable behavior still degrades to direct database operations without a UI crash.
- Existing cache-service tests remain green, and no new unbounded polling or prefix invalidation is introduced.

## 5. Pre-merge modal hardening

These are small, modal-specific fixes. They should be completed before merging the intercepting-route change.

### 5.1 Clean up the scan safety timer

**Current location:** `components/spy/brand-deep-dive-view.tsx`, the 45-second timeout in `handleCheckAdLibraryNow`.

Implementation:

- Store the timeout ID in a ref.
- Clear the previous timer before starting a new one.
- Clear the timer in the component cleanup effect.
- Do not call `fetchBrandData(true)` after the component has unmounted.
- Preserve the existing abort-controller/request-ID protections.

Acceptance criteria:

- Closing the modal during the 45-second wait does not trigger a late fetch or state update.
- Repeated scan clicks do not create multiple safety timers.

### 5.2 Make nested dialog Escape behavior deterministic

**Current location:** `components/spy/brand-overlay-sheet.tsx` and existing child modal components.

Implementation:

- Establish one clear topmost-dialog rule.
- When a child dialog is open, the overlay must not close.
- The child dialog must close itself on Escape, or the shared dialog manager must close the topmost child.
- Extend editable-target detection to include `SELECT` and `contenteditable` elements.
- Ensure only one handler acts on an Escape event.

Acceptance criteria:

- Escape closes Product Details when it is open.
- Escape closes the overlay only after child dialogs are closed.
- Escape while editing an input, select, or contenteditable field does not unexpectedly close a dialog.

### 5.3 Resolve interception scope

The root-level parallel slot currently intercepts all soft navigations to `/spy/brand/[id]`. Decide whether that is intentional for every brand link or only for tracker-origin links.

Recommended default: keep the global route behavior only if all brand links are expected to open the same overlay. Otherwise, make the originating links opt into the modal behavior and keep direct navigation standalone.

The decision must be recorded before implementation of any route-scope change.

### 5.4 Confirm the actual scroll owner

The current overlay locks `<main>`, while the tracker table has a nested scroll container. Before merge, verify which element owns scrolling at desktop and mobile breakpoints.

If the nested tracker container is the owner:

- Preserve and restore its `scrollTop`.
- Prevent background keyboard scrolling while the overlay is active.
- Keep the modal content scrollable independently.
- Add a browser-level test for opening and closing from a deep table position.

## 6. Implementation phases

### Phase 1 — Establish a stable orchestration boundary

Create or confirm the following shared types without changing behavior:

- `BrandDeepDiveViewProps`.
- `BrandDeepDiveData` and summary types.
- Product and creative item view-model types.
- Tab key union: `analytics | products | creatives`.
- Shared action result and error types.

Move repeated constants and pure formatting helpers into nearby modules only when they have a single clear owner. Do not create a generic `utils.ts` dump.

Expected result:

- `BrandDeepDiveView` still renders the same UI.
- TypeScript remains clean.
- No route or API changes.

### Phase 2 — Extract the tab navigation and header

Create:

- `components/spy/brand-deep-dive-header.tsx`
- `components/spy/brand-deep-dive-tabs.tsx`

`BrandDeepDiveHeader` owns only:

- Brand identity and status presentation.
- Scan timestamps and verification state.
- Watchlist control presentation.
- Header action callbacks supplied by the parent.

`BrandDeepDiveTabs` owns only:

- The accessible `tablist`.
- Tab buttons, counts, selected state, and keyboard semantics.
- Calls to the parent `onTabChange` callback.

It must not fetch data or manipulate browser history directly.

### Phase 3 — Extract analytics

Create `components/spy/analytics-tab.tsx`.

Move into this component:

- Launch velocity and commercial-strategy summaries.
- Analytics cards and trend sections.
- Winner creative spotlight.
- Sister-page/domain analytics presentation.
- Analytics-specific empty and loading states.

Inputs should be data and callbacks, not the entire parent state object. For example:

```tsx
<AnalyticsTab
  brand={brand}
  summary={summary}
  history={history}
  products={products}
  onOpenProducts={() => onTabChange("products")}
  onSelectSisterPage={onSelectSisterPage}
/>
```

The component should remain mostly presentational. Derived analytics should be computed in a memoized selector or data hook when the calculation is non-trivial.

### Phase 4 — Extract products and product actions

Create:

- `components/spy/products-tab.tsx`
- `components/spy/product-filters.tsx`
- `components/spy/product-cards-grid.tsx` if the existing grid is large enough to justify it.
- `components/spy/hooks/use-brand-products.ts`.

`useBrandProducts` owns:

- Lazy product-tab loading.
- Abort controllers and request IDs.
- Search, status, active-only, and offer filters.
- Sync and local-rescan actions.
- Product refresh and deletion actions.
- Product-detail selection state only if it is not moved to the modal coordinator.

`ProductsTab` owns:

- Product controls and empty/error/loading states.
- The filtered product list.
- Grid/list presentation.
- Callbacks for viewing details and creatives.

Performance rules:

- Load product data when the products tab is first activated, not during initial analytics render.
- Memoize filtered results and expensive counts.
- Use stable callbacks for product cards.
- Add virtualization or pagination if production datasets commonly exceed the current render budget.
- Never fetch product details for every card during list rendering.

### Phase 5 — Extract creatives and feed behavior

Create:

- `components/spy/creatives-tab.tsx`
- `components/spy/creative-filters.tsx`.
- `components/spy/hooks/use-brand-creatives.ts` if feed state and loading logic are substantial enough to be independent.

Move into this boundary:

- Feed search, media type, status, and sort filters.
- Infinite-scroll sentinel behavior.
- Creative card rendering.
- Product-filter context and clear-filter actions.
- Creative empty, loading, and error states.

Performance rules:

- Keep feed loading bounded and cancellable.
- Avoid re-rendering the entire feed when only one filter or card changes.
- Use stable keys based on durable creative IDs.
- Use virtualization if the feed can grow beyond a reasonable viewport window.

### Phase 6 — Extract data and action hooks

Create:

- `components/spy/hooks/use-brand-deep-dive-data.ts`
- `components/spy/hooks/use-brand-actions.ts`
- `components/spy/hooks/use-brand-tab-state.ts`

`useBrandDeepDiveData` owns:

- Initial and silent brand fetches.
- Canonical ID handling.
- Loading and error state for primary data.
- Realtime subscription setup and cleanup.
- Primary and revalidation abort controllers.

`useBrandActions` owns:

- Triggering the ad-library scan.
- Watchlist mutations.
- Product sync/rescan commands if they are not owned by `useBrandProducts`.
- Toast messages for completed or failed actions.

`useBrandTabState` owns:

- Active tab initialization from the query string.
- Modal versus standalone history semantics.
- Tab scroll-position storage and restoration.
- Popstate handling and cleanup.

The hooks must expose narrow results. Avoid returning one large object containing every state value, because that causes unrelated consumers to re-render.

### Phase 7 — Extract modal orchestration and focus behavior

Create `components/spy/brand-deep-dive-modals.tsx` or a small modal coordinator hook.

It owns:

- Product detail modal selection.
- Export dossier modal visibility.
- Manage-domain modal visibility.
- Sister-page modal/selector state.
- The ordering rule for nested dialogs.

The coordinator must not own the underlying modal implementations. Existing reusable modal components remain responsible for their own content and close controls.

Add focus behavior to `BrandOverlaySheet`:

- Move focus into the overlay on open.
- Trap focus while `aria-modal="true"`.
- Restore focus to the originating brand link on close when possible.
- Mark or inert the background application while the modal is active.

## 7. Rendering and state strategy

### 7.1 Active-tab rendering

Replace the current pattern of rendering all tab panels with CSS `hidden` classes with conditional rendering:

```tsx
{activeTab === "analytics" && <AnalyticsTab {...analyticsProps} />}
{activeTab === "products" && <ProductsTab {...productsProps} />}
{activeTab === "creatives" && <CreativesTab {...creativesProps} />}
```

Data remains cached in hooks or the parent while the panel DOM is unmounted. Local filter state should either remain in the parent hook or be restored from a tab-state object when the tab remounts.

### 7.2 Prevent unrelated re-renders

- Keep tab props narrow and stable.
- Use `React.memo` only for demonstrably expensive cards or rows.
- Memoize filtered collections and expensive derived summaries.
- Avoid passing the complete `data` object to every tab.
- Do not put rapidly changing filter state into the top-level view unless another tab needs it.

### 7.3 Async safety

- Every fetch gets an abort or request-generation guard.
- Every realtime channel is removed on cleanup.
- Every timeout and interval is cleared on cleanup.
- Closing the overlay must not leave background work that updates unmounted UI.
- Errors from an inactive tab must not replace the primary view’s error state.

## 8. Testing plan

### 8.1 Unit tests

Add tests for:

- Tab query-string initialization.
- Modal `replaceState` versus standalone `pushState` behavior.
- Tab scroll-position save and restore.
- Product filter combinations.
- Creative filter combinations.
- Request cancellation and stale-response protection.
- Timer cleanup after unmount.

### 8.2 Component tests

Cover:

- Only the active tab is mounted.
- Product loading begins on first product-tab activation.
- Tab counts and selected state render correctly.
- Empty, loading, and error states are isolated to their tab.
- Child dialog Escape closes the child first.
- Overlay Escape closes the overlay when no child dialog is open.

### 8.3 Browser/e2e tests

Add browser coverage for:

1. Scroll the tracker table deep into the list.
2. Open a brand through soft navigation.
3. Confirm the overlay is rendered and the background remains mounted.
4. Switch tabs and confirm the URL/history behavior.
5. Close with backdrop, close button, and Escape.
6. Confirm the tracker returns to the same row and scroll position.
7. Open a child dialog and confirm Escape closes only the child.
8. Refresh or open a direct brand URL and confirm standalone rendering.
9. Open the full-window link and confirm the current tab is preserved.

### 8.4 Verification commands

Run after each phase:

```powershell
node '.\node_modules\typescript\bin\tsc' --noEmit
node '.\node_modules\next\dist\bin\next' build
npm test
git diff --check
```

Also perform a manual browser check at desktop and mobile breakpoints because scroll ownership and modal focus behavior are viewport-sensitive.

## 9. File-level delivery sequence

### Change 1 — Modal hardening before merge

- `components/spy/brand-deep-dive-view.tsx`
- `components/spy/brand-overlay-sheet.tsx`
- Child dialog component(s) requiring Escape handling.
- Tests for timer cleanup and nested dialog behavior.

### Change 2 — Shell and tabs

- `components/spy/brand-deep-dive-view.tsx`
- `components/spy/brand-deep-dive-header.tsx`
- `components/spy/brand-deep-dive-tabs.tsx`
- `components/spy/analytics-tab.tsx`
- `components/spy/products-tab.tsx`
- `components/spy/creatives-tab.tsx`

### Change 3 — Hooks and async ownership

- `components/spy/hooks/use-brand-deep-dive-data.ts`
- `components/spy/hooks/use-brand-products.ts`
- `components/spy/hooks/use-brand-creatives.ts`
- `components/spy/hooks/use-brand-actions.ts`
- `components/spy/hooks/use-brand-tab-state.ts`

### Change 4 — Modal and performance refinement

- `components/spy/brand-deep-dive-modals.tsx`
- `components/spy/brand-overlay-sheet.tsx`
- Product/creative list components if profiling justifies them.
- Component and browser tests.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tab extraction changes data timing | Preserve current request functions first; move ownership only after behavior tests exist. |
| Unmounting tabs loses filter state | Keep filter state in a hook or parent tab-state object. |
| Modal and standalone behavior diverge | Keep one shared view and test both route modes. |
| More components increase prop plumbing | Use focused hooks and view-model props; avoid a global context for local tab state. |
| Large product/creative lists remain slow | Profile after active-tab rendering, then add memoization or virtualization only where measured. |
| Child dialogs close the wrong layer | Define and test a single topmost-dialog ownership rule. |
| Refactor hides quota regressions | Preserve explicit projections, bounded requests, and existing abort/throttle behavior. |

## 11. Definition of done

- The modal route and standalone route render the same functional Brand Deep Dive.
- `BrandDeepDiveView` is an orchestration component rather than a 2,300-line feature container.
- Analytics, products, and creatives are independently renderable and testable.
- Only the active tab is mounted by default.
- Product and creative data loads are lazy, cancellable, and cached after first load.
- Timers, requests, realtime channels, and event listeners clean up on unmount.
- Nested dialog Escape behavior is deterministic.
- Focus is moved into and restored from the overlay.
- Tracker scroll position survives open/close at desktop and mobile breakpoints.
- Active tab state survives the full-window transition.
- TypeScript, production build, automated tests, diff checks, and browser checks pass.
- No API contract, database projection, realtime publication, or Supabase quota rule is weakened.

## 12. Recommended execution order

1. Apply modal hardening and resolve interception scope.
2. Merge the modal route change.
3. Extract tab components while preserving the existing data flow.
4. Switch to active-tab rendering and add lazy loading.
5. Extract data/action hooks.
6. Add focus management, performance profiling, and browser tests.
7. Perform a final review against both this plan and the original intercepting-route plan.
