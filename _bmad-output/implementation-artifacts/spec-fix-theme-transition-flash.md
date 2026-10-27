---
title: 'Fix light/dark theme transition flash'
type: 'bugfix'
created: '2026-10-27'
status: 'done'
route: 'one-shot'
baseline_commit: '86fe6cc598f8616eddcfa243cfa034bccf87be81'
---

# Fix light/dark theme transition flash

## Intent

**Problem:** Switching themes combines a document View Transition with independent `transition-all` animations, allowing light borders to remain visible over the new dark background.

**Approach:** Apply the theme class atomically for one frame, disable competing transitions during that frame, remove the root cross-fade, and preserve only the sidebar layout transition.

## Suggested Review Order

- Confirm theme changes are atomic and persisted without View Transition compositing.
  [`theme-toggle.tsx:26`](../../components/theme-toggle.tsx#L26)

- Confirm temporary transition suppression keeps borders and backgrounds synchronized.
  [`globals.css:51`](../../app/globals.css#L51)

- Confirm layout width animation remains while theme-sensitive shell transitions are narrowed.
  [`navigation.tsx:72`](../../components/navigation.tsx#L72)

- Confirm the top bar no longer interpolates all properties during theme changes.
  [`top-bar.tsx:53`](../../components/top-bar.tsx#L53)
