# Brand Deep Dive Intercepting Route Plan Validation

## Validation result

The core Next.js topology is valid: `app/@modal/(.)spy/brand/[id]` is the correct interception shape for this root-level route. However, the plan is not ready for implementation yet.

## Findings

### 1. AppShell and provider integration is unspecified

- **Location:** Plan §5.3 and §6; `app/layout.tsx`, `components/app-shell.tsx`
- **Trigger:** The plan does not define where the modal slot is rendered relative to `AppShell` and its providers.
- **Guard:** Pass `modal` through `AppShell`, or render it inside the existing `ToastProvider`, `AuthProvider`, `WorkspaceProvider`, and `SidebarProvider` boundaries.
- **Consequence:** The modal can miss required React contexts or render outside the application shell.

### 2. Body scroll locking targets the wrong scroll owner

- **Location:** Plan §4.2; `components/app-shell.tsx:40-48`
- **Trigger:** The document body is already `overflow-hidden`; the AppShell `<main>` element owns table scrolling.
- **Guard:** Lock the background `<main>` element and restore its overflow and scroll position during cleanup.
- **Consequence:** The tracker can remain scrollable behind the overlay.

### 3. Shared tab logic selects the wrong scroll container

- **Location:** Plan §3.1; existing brand page tab logic
- **Trigger:** The shared view currently uses `document.querySelector("main")` for tab scroll restoration.
- **Guard:** Use a ref to the active standalone or modal scroll container.
- **Consequence:** Modal tab changes can scroll or restore the background tracker instead.

### 4. Overlay header data flow is incomplete

- **Location:** Plan §4.1-§4.2 and §3.3
- **Trigger:** The overlay header requires brand metadata but receives only `brandId`.
- **Guard:** Expose existing fetched metadata through context/render props, or let the shared view own the header.
- **Consequence:** The header becomes duplicated, stale, or adds an unnecessary API request.

### 5. Modal history semantics are undefined

- **Location:** Plan §3.1 and §4.2; existing brand page tab logic
- **Trigger:** Brand tabs push raw history entries before `router.back()` closes the modal.
- **Guard:** Define whether tab changes use router navigation or consume tab history before closing.
- **Consequence:** Close/back can navigate through tab states instead of returning to the tracker.

### 6. A modal catch-all route is missing

- **Location:** Plan §5.3
- **Trigger:** `default.tsx` handles hard reloads but not client navigation away from the modal.
- **Guard:** Add `app/@modal/[...catchAll]/page.tsx` returning `null`.
- **Consequence:** The modal slot can remain visible on unrelated routes.

### 7. Interception scope is not defined

- **Location:** Plan §1.2 and §2
- **Trigger:** A root-level slot intercepts brand links from products, notifications, ad cards, and other pages.
- **Guard:** Declare global interception intentional, or scope the slot and links to the tracker context.
- **Consequence:** Users can see a tracker-specific overlay over unrelated pages.

### 8. Nested modal behavior is assumed rather than audited

- **Location:** Plan §5.1; existing modal components
- **Trigger:** The plan assumes child ESC handling and z-index behavior without matching current implementations.
- **Guard:** Audit `ProductDetailsModal`, `ExportDossierModal`, `ManageDomainModal`, `MoveWorkspaceModal`, and the creative lightbox.
- **Consequence:** ESC or backdrop clicks can close the wrong modal layer.

### 9. Accessibility behavior is unspecified

- **Location:** Plan §4.2
- **Trigger:** Focus management, dialog semantics, inert background, and focus restoration are not defined.
- **Guard:** Add `role="dialog"`, `aria-modal`, an accessible label, focus trapping, focus restoration, and background inertness.
- **Consequence:** Keyboard and screen-reader users can interact with hidden tracker content.

### 10. Verification criteria are too vague

- **Location:** Plan §6, Phase 5
- **Trigger:** Browser testing has no fixtures, authentication setup, assertions, or acceptance matrix.
- **Guard:** Add Playwright tests for soft navigation, hard navigation, F5, tab URLs, nested modals, mobile, and cleanup.
- **Consequence:** Routing regressions can pass an informal smoke test.

### 11. Cleanup claims need verification

- **Location:** Plan §5.2
- **Trigger:** Unmount cleanup is claimed, but realtime channels, aborts, timers, and media cleanup are not verified.
- **Guard:** Assert channel removal, `AbortController` cancellation, timer cleanup, and media teardown after close.
- **Consequence:** Repeated opens can leak subscriptions, requests, or video memory.

### 12. Rollback instructions are incomplete

- **Location:** Plan §7
- **Trigger:** Removing `@modal` and restoring `app/layout.tsx` does not restore extraction changes.
- **Guard:** Define a commit-level rollback covering `AppShell`, the shared view, standalone wrapper, slot, and overlay.
- **Consequence:** Rollback can leave the standalone brand route broken.

### 13. The stated source size is inaccurate

- **Location:** Plan §3, line 56
- **Trigger:** The plan says the current page has 2,275 lines; the repository currently contains 2,304 lines.
- **Guard:** Update the estimate or state that it is approximate.
- **Consequence:** The implementation scope is understated.

## Recommended revision order

1. Define provider and AppShell integration.
2. Refactor scroll ownership and body/background locking.
3. Define modal and tab history behavior.
4. Add the modal catch-all route.
5. Decide whether interception is global or tracker-only.
6. Add accessibility, nested-modal, and Playwright acceptance criteria.

## Repository evidence

- Current root layout: `app/layout.tsx`
- Current shell and scroll owner: `components/app-shell.tsx`
- Current standalone brand page: `app/spy/brand/[id]/page.tsx`
- Current tracker table links: `components/pages-table.tsx`
- Installed Next.js guidance: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md` and `parallel-routes.md`

Context7 MCP was unavailable during this validation; the installed Next.js 16.2.11 documentation was used instead.
