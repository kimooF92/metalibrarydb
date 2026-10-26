# Technical Implementation Plan: Next.js Intercepting Route for Brand Deep Dive

**Document Version:** 1.1 (Hardened with Real Production Guards)  
**Target Next.js Version:** 16.2.11 (React 19.2.4, App Router)  
**Parent Project:** Meta Brand Result (`4022b9f2-9f26-81a8-b61c-c7f68abc3b8b`)  
**Status:** In Progress / Implementing  

---

## 1. Executive Summary & Objective

### 1.1 The Problem
When users research competitors in the tracked pages table:
1. They scroll down through 50–100+ brands and configure custom filters/sorts.
2. Clicking a brand navigates directly to `/spy/brand/[id]` via a full page transition.
3. Upon finishing their review and clicking **Back**, the table unmounts/re-mounts, resetting scroll position to `0,0` and losing browsing flow.

### 1.2 The Solution
Implement the **Next.js Parallel + Intercepting Route Pattern**:
- **Soft Navigation (clicking from the table)**: Next.js intercepts `/spy/brand/[id]` and renders the brand deep dive inside an **expansive slide-over overlay (94vw / full-height sheet)** over the tracker table.
- **Table Preservation**: The tracker table behind the overlay remains **100% mounted in memory** — preserving scroll position, active filters, search text, and WebSocket subscriptions.
- **Frictionless Exit**: Pressing `ESC`, clicking the backdrop, or clicking `[X]` calls `router.back()`, instantly dismissing the overlay and leaving the user at the exact row they were reviewing.
- **Hard Navigation (direct link or F5 refresh)**: Entering `/spy/brand/[id]` directly in the address bar or sharing the link renders the full standalone page layout.

---

## 2. Architecture & Routing Topology

Next.js App Router supports this via **Parallel Routes (`@modal` slot)** paired with **Intercepting Routes (`(.)spy/brand/[id]`)**.

### Directory Structure:

```text
app/
├── layout.tsx                              # Injects @modal slot inside <ToastProvider> & <AppShell>
├── @modal/
│   ├── default.tsx                         # Returns null when no modal is active
│   ├── [...catchAll]/
│   │   └── page.tsx                        # Returns null to prevent stale slots on unrelated navigations
│   └── (.)spy/
│       └── brand/
│           └── [id]/
│               └── page.tsx                # Intercepted route: renders <BrandOverlaySheet>
├── spy/
│   └── brand/
│       └── [id]/
│           └── page.tsx                    # Standalone full-page route (for hard refreshes & deep links)
components/
└── spy/
    ├── brand-deep-dive-view.tsx            # Extracted core view (shared between modal & full page)
    └── brand-overlay-sheet.tsx             # Slide-over overlay container (backdrop, top bar, ESC listener)
```

---

## 3. Real Production Guards & Hardened Rules

Based on strict validation against the active codebase, these 5 critical guards are built directly into the implementation:

### 1. Provider & AppShell Injection Boundary
- `app/layout.tsx` renders `{modal}` **inside** `<ToastProvider>` and `<AppShell>`, ensuring `useToast()` and workspace contexts work without runtime errors.

### 2. Precise Scroll Lock on `<main>`
- `document.body` is globally `overflow-hidden`. The actual scroll owner is `<main className="flex-1 overflow-y-auto">` inside `AppShell`.
- `BrandOverlaySheet` explicitly freezes `<main>` with `overflow: hidden` on mount and restores its original state on unmount.

### 3. Container-Scoped Tab Scroll Ref
- `BrandDeepDiveView` replaces `document.querySelector("main")` with an internal container `ref` (`scrollContainerRef`).
- When switching tabs inside the modal, only the modal container measures and scrolls, never the background table.

### 4. Tab History Semantics in Modal Mode
- When `isModal = true`, tab switching uses `window.history.replaceState` instead of `pushState`.
- This ensures pressing `ESC` or clicking `[X]` / `router.back()` exits the modal immediately rather than stepping back through tab changes.

### 5. Catch-All Route for Parallel Slot
- `app/@modal/[...catchAll]/page.tsx` returns `null` so navigating to other routes (e.g. `/settings`, `/products`) cleanly unmounts the modal slot.

---

## 4. Component Refactoring & Implementation Details

### 4.1 `BrandDeepDiveView` (`components/spy/brand-deep-dive-view.tsx`)
Extracted from `app/spy/brand/[id]/page.tsx` (~2,300 lines) with:
- `isModal?: boolean`
- `onClose?: () => void`
- Scoped scroll ref for tab switching
- `replaceState` for tabs when `isModal=true`
- Top action bar showing brand name, verified ad count, scan dates, and quick close

### 4.2 `BrandOverlaySheet` (`components/spy/brand-overlay-sheet.tsx`)
- Container with `z-40` backdrop blur (`bg-slate-950/60 backdrop-blur-sm`).
- Slide-over sheet with `w-full max-w-[95vw] lg:max-w-[94vw] h-full bg-white dark:bg-slate-950 shadow-2xl`.
- Window `keydown` listener for `Escape` calling `router.back()`.
- Locks `<main>` scroll while active.

### 4.3 Standalone Wrapper (`app/spy/brand/[id]/page.tsx`)
```tsx
import { BrandDeepDiveView } from "@/components/spy/brand-deep-dive-view";

export default async function BrandDeepDiveStandalonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BrandDeepDiveView id={id} isModal={false} />;
}
```

### 4.4 Intercepted Wrapper (`app/@modal/(.)spy/brand/[id]/page.tsx`)
```tsx
import { BrandOverlaySheet } from "@/components/spy/brand-overlay-sheet";
import { BrandDeepDiveView } from "@/components/spy/brand-deep-dive-view";

export default async function InterceptedBrandModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <BrandOverlaySheet>
      <BrandDeepDiveView id={id} isModal={true} />
    </BrandOverlaySheet>
  );
}
```

---

## 5. Execution Steps

1. Create `components/spy/brand-overlay-sheet.tsx` with `<main>` scroll locking and ESC dismissal.
2. Create `components/spy/brand-deep-dive-view.tsx` containing the extracted logic with `isModal` awareness.
3. Update `app/spy/brand/[id]/page.tsx` to use `BrandDeepDiveView`.
4. Update `app/layout.tsx` to accept `{ modal }` slot and pass it into `<AppShell>`.
5. Update `components/app-shell.tsx` to render `{modal}`.
6. Create `app/@modal/default.tsx` and `app/@modal/[...catchAll]/page.tsx`.
7. Create `app/@modal/(.)spy/brand/[id]/page.tsx`.
8. Verify with `tsc --noEmit` and browser validation.
