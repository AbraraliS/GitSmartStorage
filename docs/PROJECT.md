# GitStore — Project Reference

> **Your GitHub account as an infinite file system.**  
> Upload, search, and retrieve files of any format, powered by GitHub repos with an HDFS-inspired architecture.

---

## Table of Contents

1. [What It Does](#1-what-it-does)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture Overview](#4-architecture-overview)
5. [HDFS-Inspired Storage Model](#5-hdfs-inspired-storage-model)
6. [5-Layer Cache Hierarchy](#6-5-layer-cache-hierarchy)
7. [Upload Pipeline](#7-upload-pipeline)
8. [API Routes](#8-api-routes)
9. [Authentication & Security](#9-authentication--security)
10. [Data Types](#10-data-types)
11. [Background Jobs & Queue](#11-background-jobs--queue)
12. [Cloudflare Worker (CDN Proxy)](#12-cloudflare-worker-cdn-proxy)
13. [Mobile App](#13-mobile-app)
14. [Environment Variables](#14-environment-variables)
15. [Running Locally](#15-running-locally)
16. [Known Limitations & Notes](#16-known-limitations--notes)

---

## 1. What It Does

GitStore turns a user's **own private GitHub repositories** into a personal cloud file system. No external storage service is needed — all file data lives in the user's GitHub account.

Key features:

| Feature | Detail |
|---|---|
| **Data Nodes** | Each category (documents, photos, etc.) maps to a separate private GitHub repo |
| **Content Deduplication** | SHA-256 hash checked before every upload — duplicate files are skipped |
| **Adaptive Blob Uploads** | Files are split and streamed natively as binary to reduce memory load |
| **Single Final Commit** | All chunked Git blobs are assembled into a single commit to prevent history bloat |
| **AES-256-GCM Encryption** | Every chunk is encrypted client-side before leaving the browser |
| **5-Layer Cache** | In-memory → IndexedDB → Service Worker → Cloudflare CDN → GitHub API |
| **Instant Search** | O(1) keyword lookup via an inverted index stored in `index.json` |
| **Universal Previews** | PDF, Office (DOCX, XLSX), Media, Markdown, and Code previews powered by specialized renderers |
| **Fault Tolerance** | Every index write is mirrored to a secondary name-node repo |
| **Private by Design** | All repos are created with `private: true`; data never touches GitStore servers |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Auth | Auth.js (NextAuth) v5 — GitHub OAuth |
| GitHub API | `@octokit/rest` |
| Styling | Tailwind CSS v4 |
| Validation | Zod |
| Virtual Scroll | `@tanstack/react-virtual` |
| Previews | `pdfjs-dist`, `mammoth`, `xlsx`, `shiki`, `react-markdown` |
| Browser DB | `idb` (IndexedDB wrapper) |
| Service Worker | Workbox (`workbox-window`) |
| Rate Limiting | `@upstash/ratelimit` + `@upstash/redis` |
| Background Jobs | BullMQ (optional) / in-memory fallback |
| Edge CDN | Cloudflare Workers (`wrangler`) |
| Mobile | Expo / React Native (separate `mobile/` subproject) |

---

## 3. Project Structure

```
gitstore/
│
├── app/                          # Next.js App Router pages & API routes
│   ├── page.tsx                  # Landing / sign-in page
│   ├── layout.tsx                # Root layout (SessionProvider, fonts)
│   ├── globals.css               # Tailwind base styles
│   │
│   ├── dashboard/
│   │   └── page.tsx              # File browser with virtual scroll + search
│   ├── upload/
│   │   └── page.tsx              # Upload queue UI
│   ├── settings/
│   │   └── page.tsx              # Node management, sync, backup
│   │
│   └── api/
│       ├── auth/[...nextauth]/   # NextAuth handler (GET + POST)
│       ├── bootstrap/            # POST — create system repos + initial index
│       ├── files/                # GET (search) + DELETE
│       │   └── download/         # GET — serve a file blob
│       ├── nodes/                # GET (list) + POST (create)
│       ├── sync/                 # GET (fetch index) + POST (sync master→secondary)
│       │   └── backup/           # POST — replicate to a secondary GitHub account
│       └── upload/
│           ├── blob/             # POST — write binary raw array buffer to orphaned Git blob
│           ├── finalize/         # POST — assemble blobSha(s) into single commit
│           └── complete/         # POST — finalise upload, update index.json
│
├── components/
│   ├── auth/SignInButton.tsx      # GitHub OAuth sign-in button
│   ├── files/
│   │   ├── FileCard.tsx          # Single file row in the dashboard list
│   │   ├── FilterPanel.tsx       # Type / node / tag / date filter sidebar
│   │   └── SearchBar.tsx         # Instant search input
│   ├── layout/
│   │   ├── Sidebar.tsx           # Left navigation (Desktop)
│   │   ├── Topbar.tsx            # Header with user avatar (Desktop)
│   │   ├── MobileHeader.tsx      # Contextual header with back-button memory (Mobile)
│   │   ├── FAB.tsx               # Floating Action Button for mobile UX
│   │   └── FabSheet.tsx          # Drawer interaction for FAB options
│   ├── preview/                  # Specialized format renderers
│   │   ├── PreviewModal.tsx      # Optimized viewer bypassing object URL blobs for specific files
│   │   ├── PdfCanvasViewer.tsx   # Direct DOM injection via PDF.js worker
│   │   ├── DocxPreview.tsx       # Mammoth-based DOCX rendering
│   │   ├── XlsxPreview.tsx       # SheetJS-based XLSX rendering
│   │   └── CodePreview.tsx       # Blob.text() optimized extraction for shiki
│   └── upload/
│       └── DropZone.tsx          # Drag-and-drop / file picker
│
├── lib/
│   ├── github.ts                 # ALL GitHub API calls (Octokit wrapper)
│   ├── cache.ts                  # 5-layer cache logic (L1–L4 + helpers)
│   ├── index.ts                  # index.json schema, search, tokeniser
│   ├── upload.ts                 # Browser-side upload pipeline (Adaptive Blob logic)
│   └── ...                       # Other library implementations
│
└── mobile/                       # Expo/React Native companion app
```

---

## 4. Architecture Overview

```
Browser
│
├── [Landing page]  ──OAuth──▶  GitHub  ──token──▶  NextAuth session
│
├── [Dashboard]
│   │
│   ├── loadIndex()  →  L1 (memory)  →  L2 (IndexedDB)  →  /api/sync (GitHub)
│   │
│   └── searchFiles(index, query)  →  O(1) inverted index lookup
│
├── [Upload page]
│   │
│   └── runUploadPipeline()
│       1. SHA-256 hash  →  deduplicate check against L1 index
│       2. slice into chunks
│       3. AES-256-GCM encrypt each chunk
│       4. POST /api/upload/blob  ×N  (Application/octet-stream directly)
│       5. POST /api/upload/finalize → Single append commit using blobShas
│       6. POST /api/upload/complete → Atomic update to index.json
│
└── [Settings page]
    ├── POST /api/nodes          →  create a new data-node repo
    └── POST /api/sync           →  force master → secondary mirror

Next.js Server (API routes)
│
├── Every route:  auth() → assertOwner() → checkRateLimit() → logic
│
├── GitHub API calls via lib/github.ts (Octokit)
│   ├── index.json on gitstore-master  (source of truth)
│   └── index.json on gitstore-secondary  (fault-tolerance mirror)
│
└── Data repos  (gitstore-documents, gitstore-photos, …)
```

---

## 5. HDFS-Inspired Storage Model

GitStore borrows concepts from the Hadoop Distributed File System:

| HDFS concept | GitStore equivalent |
|---|---|
| **NameNode** | `gitstore-master` repo containing `index.json` |
| **Secondary NameNode** | `gitstore-secondary` repo — mirror of `index.json` |
| **DataNode** | One GitHub repo per category (e.g. `gitstore-documents`) |
| **Block** | Orphaned Git Blobs resulting from file chunks |
| **Block Map** | `FileRecord.chunks[]` — IDs of all chunk blobs mapped logically |

---

## 6. 5-Layer Cache Hierarchy

| Layer | Storage | Latency | Description |
|---|---|---|---|
| **L1** | `Map` (process memory) | ~0 ms | Fastest; lost on page refresh |
| **L2** | IndexedDB (browser) | ~5 ms | Survives refresh; backed by `idb` |
| **L3** | Service Worker / Workbox | ~10 ms | Network-request-level cache; managed by SW |
| **L4** | Cloudflare Worker edge | ~20–50 ms | CDN proxy for raw GitHub file URLs |
| **L5** | GitHub API | ~200–600 ms | Source of truth; last resort |

---

## 7. Upload Pipeline

Implemented functionally across `lib/upload.ts` and API boundaries. Current version optimizes memory consumption aggressively. 

```
File selected
    │
    ▼
1. isDuplicate(hash)?  ──YES──▶  skip upload
    │ NO
    ▼
2. sliceFile(file)
    │
    ▼
3. For each chunk:
   a. AES-256-GCM encrypt with per-file CryptoKey
    │
    ▼
4. Upload native binary stream (parallel):
   POST /api/upload/blob (application/octet-stream)
   → Server decodes seamlessly and injects as an orphaned Git blob return `blobSha`.
    │
    ▼
5. POST /api/upload/finalize
   → Constructs a single git commit applying all new `blobSha`s to the repo's HEAD tree.
    │
    ▼
6. POST /api/upload/complete
   → Atomically patches index.json with new file records, handling Git concurrency.
   → updateCacheAfterWrite()  →  L1 + L2 updated
```

**Memory Detail:** Sending raw chunks via `application/octet-stream` circumvents the heavy `FileReader` base64 overhead, lowering peak client RAM usage significantly.

---

## 8. API Routes

All routes follow the pattern: **Auth → Owner assertion → Input validation (Zod) → Rate limit → Business logic**.

| Method | Path | Description | Rate limit |
|---|---|---|---|
| `GET` | `/api/sync` | Fetch current `index.json` from GitHub | 5 / 60 s |
| `POST` | `/api/sync` | Force-sync master → secondary | 5 / 60 s |
| `GET` | `/api/nodes` | List all data nodes | 60 / 60 s |
| `POST` | `/api/nodes` | Create a new data-node repo | 60 / 60 s |
| `POST` | `/api/upload/blob` | Create orphaned raw Git blob (`octet-stream`) | 100 / 60 s |
| `POST` | `/api/upload/finalize` | Commit generated `blobSha`s securely | 10 / 60 s |
| `POST` | `/api/upload/complete` | Finalise upload, patch index.json with retries | 10 / 60 s |

---

## 9. Authentication & Security

### Security measures

| Concern | Implementation |
|---|---|
| **At-rest encryption** | AES-256-GCM client-side before any data leaves the browser |
| **Preview Sanitization**| `dompurify` integration to escape unsafe code elements and mitigate XSS vectors |
| **CSP Limits** | Secure DOM extraction architecture limits blob persistence (aggressive object unmounting) |
| **Transport** | HTTPS enforced; strict security headers on every route (X-Frame-Options, CSP, etc.) |
| **Concurrency** | Exponential back-off resolving Github UI (`409` & `422`) locking conflicts |

---

## 10. Data Types

Defined in `types/index.ts`:

```typescript
DataNode       // A GitHub repo used as a data store; has id, repo name, size_mb
FileRecord     // One uploaded file; has hash, name, node, path, chunks, iv, encryptionKey
GitStoreIndex  // The full index.json: nodes + files + search_index maps
```

---

## 11. Background Jobs & Queue

`lib/queue.ts` provides an in-process FIFO job queue:
Jobs run sequentially with error capture.
For production workloads, swap the backend to **BullMQ + Redis**.

---

## 12. Cloudflare Worker (CDN Proxy)

Source: `worker/index.ts` — deploy with `wrangler deploy`.

**Purpose:** Serve GitHub raw file URLs through Cloudflare's edge network (L4 cache).

---

## 13. Mobile App

Located in `mobile/` — a separate **Expo / React Native** project.

---

## 14. Environment Variables

File: `.env.local`

| Variable | Required | Description |
|---|---|---|
| `GITHUB_ID` | **Yes** | GitHub OAuth App Client ID |
| `GITHUB_SECRET` | **Yes** | GitHub OAuth App Client Secret |

---

## 15. Running Locally

```bash
cd gitstore
npm install
npm run dev
```

---

## 16. Known Limitations & Notes

| Item | Detail |
|---|---|
| **Browser Memory Constraint** | Despite optimizations, very large client-side AES-GCM file encryptions can still pressure constrained browser VMs (mobile). |
| **GitHub API Rate Limits** | Heavy data ingestion is subject to general GitHub v3 tiering limitations. |
| **Preview Reliability** | Highly complex DOCX/XLSX structures may experience partial feature-degradation via Mammoth/SheetJS versus pure native tooling. |

---

## 17. Roadmap

* **Multi-provider Storage:** Add generic integration abstractions for external providers beyond GitHub.
* **Mobile Enhancements:** Push complete offline-first support.
* **AI Search:** Embeddings layer over indexing logic for semantic lookup.
