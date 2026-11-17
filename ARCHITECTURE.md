# Meta Ad Library Tracker — System Architecture & Guidelines

This document serves as the canonical architectural specification for the **Meta Ad Library Tracker** project. All developers and AI coding agents working on this codebase must adhere to the patterns and structural conventions described below.

---

## 1. High-Level System Overview

The system is a full-stack intelligence platform that monitors Meta (Facebook/Instagram) Ad campaigns, tracks advertiser velocity, extracts product landing page details (via Firecrawl, JSON-LD, and JEV pipelines), downloads ad media creatives to Backblaze B2, and generates competitive ecommerce insights.

```
┌────────────────────────────────────────────────────────┐
│                   Next.js App Router                   │
│   (Server Components, Client Interactivity, Route APIs) │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
       Drizzle ORM Queries         Task Dispatch / Queuing
               │                          │
               ▼                          ▼
     ┌──────────────────┐       ┌──────────────────┐
     │ Supabase Postgres│       │ Upstash QStash & │
     │  (Database & RLS)│       │  Trigger.dev v3  │
     └──────────────────┘       └─────────┬────────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                        │                                   │
                        ▼                                   ▼
             ┌─────────────────────┐             ┌─────────────────────┐
             │ Local/Cloud Worker  │             │   External APIs     │
             │ (Playwright Runner) │             │ (Apify, Firecrawl,  │
             │                     │             │  Backblaze B2, AI)  │
             └─────────────────────┘             └─────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | Server-side rendering, routing, API endpoints |
| **Language** | TypeScript (Strict mode) | Type safety and domain contracts |
| **Styling & UI** | Tailwind CSS, shadcn/ui, Base UI | Design system primitives and layouts |
| **Database** | PostgreSQL (Supabase) | Primary relational store |
| **ORM** | Drizzle ORM | Schema definition and typed SQL queries |
| **Rate Limit & Cache** | Upstash Redis | API throttling and temporary cache |
| **Message Queue** | Upstash QStash | Cron triggers and asynchronous task fan-out |
| **Background Tasks** | Trigger.dev v3 | Long-running tasks, retries, and media refreshers |
| **Scraper Worker** | Playwright & Apify | Meta Ad Library crawling and browser automation |
| **Media Storage** | Backblaze B2 & Cloudflare Worker | Ad creative storage and image proxy CDN |

---

## 3. Directory Layout & Responsibilities

The codebase follows a **Clean Root Architecture** with root-relative path resolution (`@/*` mapping to `./*`):

```
meta-brand-result/
├── .github/workflows/      # Automated GitHub Actions workers & CI checks
├── actions/                # Next.js Server Actions for client-triggered mutations
├── app/                    # Next.js App Router (pages, layouts, route handlers, modals)
│   ├── @modal/             # Intercepting routes for modal overlays (Brand Deep-Dive)
│   ├── api/                # REST API route handlers
│   └── (routes)/           # UI pages (brands, products, spy, analytics, discovery)
├── components/             # GLOBAL design system and shared primitives
│   ├── ui/                 # Reusable atom components (buttons, dialogs, dropdowns)
│   ├── layout/             # Application shell, sidebar, navigation, theme toggle
│   └── common/             # Cross-cutting widgets (badges, empty states, search bars)
├── db/                     # Database layer
│   ├── schema.ts           # Drizzle relational schemas & TypeScript types
│   └── index.ts            # Postgres connection client & pooler settings
├── docs/                   # Developer documentation & operational guides
│   ├── planning/           # (Ignored) Internal sprint plans, reviews, and audits
│   └── archive/            # (Ignored) Historical data fixtures and seed spreadsheets
├── drizzle/                # Generated SQL migrations (Drizzle Kit)
├── features/               # Modular domain features (Feature-First architecture)
│   ├── analytics/          # Dashboards, velocity boards, KPI metrics
│   ├── brands/             # Brand tracking, filters, and page management
│   ├── discovery/          # New page discovery and preview engine
│   ├── opportunities/      # AI prompt wizards, export audits, and lead detection
│   ├── products/           # Scraped products, carousel bundles, price referees
│   ├── spy/                # Ad creative cards, video playback, and transcriptions
│   └── suppliers/          # Supplier catalogs and reverse lookup
├── hooks/                  # Globally reusable utility hooks
├── lib/                    # Shared utilities, API clients, algorithms, and validators
├── public/                 # Static public web assets (icons, logos, manifests)
├── scripts/                # Operational scripts, database migrations, and testing tools
├── src/
│   └── trigger/            # Trigger.dev v3 background task pipelines
├── types/                  # Global and ambient TypeScript interfaces
├── worker/                 # Local & CI Playwright crawling worker engine
├── workers/                # Cloudflare Edge workers (image proxy)
├── .env.example            # Sanitized environment variable template
├── .gitignore              # Production gitignore rules
├── AGENTS.md               # Mandatory AI developer rules & constraints
└── README.md               # Developer setup and onboarding guide
```

---

## 4. Architectural Invariants & Coding Standards

### 1. Component Boundaries: `components/` vs `features/`
- **Generic Primitives go in `components/ui/` or `components/layout/`**: Buttons, dialogs, tooltips, navbar, app-shell. These components have **zero knowledge** of brand tracking, ad libraries, or database entities.
- **Domain UI goes in `features/<domain>/components/`**: Brand tables, ad cards, product extractors, opportunity wizards.
- **Strangler Fig Migration**: When relocating components from `components/<domain>` to `features/<domain>`, always maintain a backward-compatible barrel re-export in the legacy path to prevent breaking existing consumers.

### 2. Page Orchestrators (`page.tsx`)
- Page components must remain thin orchestrators (target `< 130 lines`).
- Pages **must not** contain direct `fetch()` calls or inline modal dialogs; they compose domain feature containers and hooks.

### 3. Database Egress & Supabase Protection
- **Explicit Column Projections**: Never execute `SELECT *` or unrestricted `.select()` without explicit column definitions. Heavy columns (`raw_extract`, `caption`, `raw_html`) must never be loaded on list views or table queries.
- **Connection Health**: Maintain `fetch_types: false` and `idle_timeout >= 120` in `db/index.ts` to protect connection pooling against Supavisor churn.
- **Strict Realtime Boundaries**: Never add high-velocity tables (`ads`, `scraped_products`) to the `supabase_realtime` publication.

### 4. Background Tasks: Worker vs Trigger.dev vs QStash
- **`worker/` (Playwright Engine)**: Handles heavy browser automation, DOM scanning, and direct Meta Ad Library interaction.
- **`src/trigger/` (Trigger.dev)**: Handles long-running scheduled tasks, media URL refreshers, and background polling.
- **QStash (`@upstash/qstash`)**: Handles lightweight HTTP message fan-out and webhook ingestion.

---

## 5. Security & Public Repository Policies

1. **Secrets**: Real credentials belong strictly in `.env.local` or GitHub Actions secrets. Real secrets must never be committed to Git.
2. **Environment Template**: Keep `.env.example` up to date with dummy values whenever a new configuration key is introduced.
3. **Data Files**: Do not commit client spreadsheets (`*.xlsx`), CSV data dumps, or raw HAR network traces (`*.har`). Internal data must be archived in `docs/archive/` or `.data/` which are excluded by `.gitignore`.
4. **Planning Drafts**: Internal sprint planning and scratch documents belong in `docs/planning/` and are excluded from public tracking.
