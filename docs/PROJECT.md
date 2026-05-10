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
| **Chunked Uploads** | Files > 4 MB are split and uploaded in parallel batches of 4 |
| **AES-256-GCM Encryption** | Every chunk is encrypted client-side before leaving the browser |
| **5-Layer Cache** | In-memory → IndexedDB → Service Worker → Cloudflare CDN → GitHub API |
| **Instant Search** | O(1) keyword lookup via an inverted index stored in `index.json` |
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
│           ├── chunk/            # PUT — write one base64 chunk to GitHub
│           └── complete/         # POST — finalise upload, update index.json
│
├── components/
│   ├── auth/SignInButton.tsx      # GitHub OAuth sign-in button
│   ├── files/
│   │   ├── FileCard.tsx          # Single file row in the dashboard list
│   │   ├── FilterPanel.tsx       # Type / node / tag / date filter sidebar
│   │   ├── NodeBadge.tsx         # Coloured repo-name pill
│   │   └── SearchBar.tsx         # Instant search input
│   ├── layout/
│   │   ├── Sidebar.tsx           # Left navigation
│   │   └── Topbar.tsx            # Header with user avatar
│   ├── providers/
│   │   └── SessionProvider.tsx   # Wraps the app in NextAuth SessionProvider
│   └── upload/
│       ├── DropZone.tsx          # Drag-and-drop / file picker
│       └── UploadQueue.tsx       # Progress list per queued file
│
├── lib/
│   ├── github.ts                 # ALL GitHub API calls (Octokit wrapper)
│   ├── cache.ts                  # 5-layer cache logic (L1–L4 + helpers)
│   ├── index.ts                  # index.json schema, search, tokeniser
│   ├── upload.ts                 # Browser-side upload pipeline
│   ├── queue.ts                  # In-process job queue (BullMQ-upgradeable)
│   ├── ratelimit.ts              # Upstash Redis rate limiters
│   └── format.ts                 # Number/date/size formatting helpers
│
├── types/index.ts                # All shared TypeScript types
├── auth.ts                       # NextAuth config (GitHub provider, JWT callbacks)
├── middleware.ts                  # Route protection (redirects unauthenticated users)
├── worker/index.ts               # Cloudflare Worker CDN proxy source
├── wrangler.toml                 # Cloudflare Worker deploy config
│
└── mobile/                       # Expo/React Native companion app
    ├── app/                      # Expo Router pages
    │   ├── index.tsx             # Home / file list
    │   ├── search.tsx            # Search screen
    │   ├── upload.tsx            # Upload screen
    │   └── settings.tsx          # Settings screen
    └── lib/api.ts                # HTTP client calling the Next.js API
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
│       2. slice into 4 MB chunks
│       3. compress (gzip, text files only)
│       4. AES-256-GCM encrypt each chunk
│       5. base64 encode
│       6. PUT /api/upload/chunk  ×N  (batches of 4, parallel)
│       7. POST /api/upload/complete  →  update index.json
│
└── [Settings page]
    ├── POST /api/nodes          →  create a new data-node repo
    ├── POST /api/sync           →  force master → secondary mirror
    └── POST /api/sync/backup    →  replicate to a second GitHub account

Next.js Server (API routes)
│
├── Every route:  auth() → assertOwner() → checkRateLimit() → logic
│
├── GitHub API calls via lib/github.ts (Octokit)
│   ├── index.json on gitstore-master  (source of truth)
│   └── index.json on gitstore-secondary  (fault-tolerance mirror)
│
└── Data repos  (gitstore-documents, gitstore-photos, …)
    └── files stored as base64 blobs via GitHub Contents API
```

---

## 5. HDFS-Inspired Storage Model

GitStore borrows concepts from the Hadoop Distributed File System:

| HDFS concept | GitStore equivalent |
|---|---|
| **NameNode** | `gitstore-master` repo containing `index.json` |
| **Secondary NameNode** | `gitstore-secondary` repo — mirror of `index.json` |
| **DataNode** | One GitHub repo per category (e.g. `gitstore-documents`) |
| **Block** | 4 MB chunk of a file stored as a GitHub blob |
| **Block Map** | `FileRecord.chunks[]` — paths of all chunks inside a data repo |
| **Replication** | `POST /api/sync/backup` — replicate to a secondary GitHub account |

### index.json schema

```jsonc
{
  "nodes": {
    "documents": { "id": "documents", "repo": "gitstore-documents", "size_mb": 12.4 }
  },
  "files": {
    "a1b2c3d4e5f6": {
      "hash": "a1b2c3d4e5f6",
      "name": "report.pdf",
      "node": "documents",
      "path": "2024/report.pdf",
      "size": 204800,
      "type": "application/pdf",
      "tags": ["work", "q4"],
      "created": "2024-11-01T10:00:00Z",
      "sync_status": "synced"
    }
  },
  "search_index": {
    "report": ["a1b2c3d4e5f6"],
    "work":   ["a1b2c3d4e5f6"],
    "q4":     ["a1b2c3d4e5f6"]
  },
  "updated_at": "2024-11-01T10:00:00Z",
  "version": 1
}
```

---

## 6. 5-Layer Cache Hierarchy

| Layer | Storage | Latency | Description |
|---|---|---|---|
| **L1** | `Map` (process memory) | ~0 ms | Fastest; lost on page refresh |
| **L2** | IndexedDB (browser) | ~5 ms | Survives refresh; backed by `idb` |
| **L3** | Service Worker / Workbox | ~10 ms | Network-request-level cache; managed by SW |
| **L4** | Cloudflare Worker edge | ~20–50 ms | CDN proxy for raw GitHub file URLs |
| **L5** | GitHub API | ~200–600 ms | Source of truth; last resort |

`loadIndex()` in `lib/cache.ts` walks L1 → L2 → asks caller to try L5.  
After any fetch from L5, `populateCacheLayers()` backfills L1 and L2.  
After any write, `updateCacheAfterWrite()` keeps L1 and L2 in sync.

---

## 7. Upload Pipeline

Implemented entirely in `lib/upload.ts` (runs in the browser):

```
File selected
    │
    ▼
1. SHA-256 hash(file)  →  12-hex-char dedup key
    │
    ▼
2. isDuplicate(hash)?  ──YES──▶  skip upload, return {skipped: true}
    │ NO
    ▼
3. sliceFile(file)  →  array of 4 MB Blob chunks
    │
    ▼
4. For each chunk:
   a. compress with CompressionStream("gzip")  [text MIME types only]
   b. AES-256-GCM encrypt with per-file CryptoKey
   c. base64 encode
    │
    ▼
5. Upload in batches of 4 (parallel):
   PUT /api/upload/chunk  { repo, path, content (base64), sha? }
    │
    ▼
6. POST /api/upload/complete
   →  addFileToIndex() + incrementNodeSize()
   →  writeRemoteIndex() [master + secondary]
    │
    ▼
7. updateCacheAfterWrite()  →  L1 + L2 updated
```

**Encryption detail:** Each file gets a unique AES-256-GCM key generated via `crypto.subtle.generateKey`. The key is exported as base64 and stored in `FileRecord.encryptionKey` inside `index.json` (which is itself in the user's private repo). The 12-byte GCM IV is stored in `FileRecord.iv`.

---

## 8. API Routes

All routes follow the pattern: **Auth → Owner assertion → Input validation (Zod) → Rate limit → Business logic**.

| Method | Path | Description | Rate limit |
|---|---|---|---|
| `GET` | `/api/sync` | Fetch current `index.json` from GitHub | 5 / 60 s |
| `POST` | `/api/sync` | Force-sync master → secondary | 5 / 60 s |
| `POST` | `/api/sync/backup` | Replicate all files to a second GitHub account | 5 / 60 s |
| `POST` | `/api/bootstrap` | Create system repos + empty index (first login) | default |
| `GET` | `/api/nodes` | List all data nodes | 60 / 60 s |
| `POST` | `/api/nodes` | Create a new data-node repo | 60 / 60 s |
| `GET` | `/api/files` | Search / list files from index | 60 / 60 s |
| `DELETE` | `/api/files?hash=` | Delete a file + update index | 20 / 60 s |
| `GET` | `/api/files/download?hash=` | Download a file blob | 60 / 60 s |
| `PUT` | `/api/upload/chunk` | Write one base64 chunk to a GitHub repo | 10 / 60 s |
| `POST` | `/api/upload/complete` | Finalise upload, patch index.json | 10 / 60 s |

---

## 9. Authentication & Security

### Auth flow
1. User clicks **Sign in with GitHub** → NextAuth GitHub provider.
2. On callback, the JWT callback stores `accessToken`, `login`, and a per-session `csrfToken` (random UUID).
3. The session object exposes those three fields to server components and API routes.
4. Middleware in `middleware.ts` redirects unauthenticated users away from `/dashboard`, `/upload`, `/settings`.

### Security measures

| Concern | Implementation |
|---|---|
| **Broken access control** | `assertOwner(sessionLogin, repoOwner)` called on every write route |
| **CSRF** | Per-session `csrfToken` bound to JWT |
| **Injection** | Zod schemas validate all API inputs; Octokit escapes all GitHub API params |
| **Data exposure** | `sha` and `encryptionKey` stripped from all client-facing responses |
| **Transport** | HTTPS enforced; strict security headers on every route (X-Frame-Options, CSP, etc.) |
| **At-rest encryption** | AES-256-GCM client-side before any data leaves the browser |
| **Rate limiting** | Upstash Redis sliding-window; gracefully disabled in dev without Redis |
| **Private repos** | `private: true` and `auto_init: true` enforced in `ensureRepo()` — never removed |
| **Trusted host** | `AUTH_TRUST_HOST=true` required for localhost dev (Auth.js v5) |

---

## 10. Data Types

Defined in `types/index.ts`:

```typescript
DataNode       // A GitHub repo used as a data store; has id, repo name, size_mb
FileRecord     // One uploaded file; has hash, name, node, path, chunks, iv, encryptionKey
GitStoreIndex  // The full index.json: nodes + files + search_index maps
UploadChunk    // One 4 MB piece of a file ready to PUT to GitHub
UploadProgress // Real-time status for the upload queue UI
FilterOptions  // type / node / tags / dateFrom / dateTo / minSize / maxSize
Job            // A background job (sync_index | replicate_backup | refresh_cache)
GitStoreSession // Extended NextAuth session: accessToken, login, optional backup creds
```

---

## 11. Background Jobs & Queue

`lib/queue.ts` provides an in-process FIFO job queue:

- `registerHandler(type, fn)` — register a handler for a job type
- `enqueue(type, payload)` — add a job and kick off processing
- Jobs run sequentially with error capture
- `enqueueViaApi(type, payload)` — browser-to-server via `POST /api/sync/queue`

**Job types:**

| Type | Purpose |
|---|---|
| `sync_index` | Pull fresh index from GitHub and repopulate caches |
| `replicate_backup` | Mirror all files to a secondary GitHub account |
| `refresh_cache` | Invalidate and reload L1/L2 caches |

For production workloads, swap the backend to **BullMQ + Redis** by pointing `enqueue` at a Redis-backed queue. The `REDIS_URL` env var is already wired.

---

## 12. Cloudflare Worker (CDN Proxy)

Source: `worker/index.ts` — deploy with `wrangler deploy`.

**Purpose:** Serve GitHub raw file URLs through Cloudflare's edge network (L4 cache).

```
Browser  →  /proxy?url=<encoded github raw URL>
              │
              ▼
         Cloudflare edge cache hit?  ──YES──▶  return (X-Cache: HIT)
              │ NO
              ▼
         Fetch from raw.githubusercontent.com
              │
              ▼
         Cache for 24 h + return (X-Cache: MISS)
```

**Security:** Only `raw.githubusercontent.com` URLs are allowed; all others return `403 Forbidden`.

Configure with `NEXT_PUBLIC_CDN_WORKER_URL` in `.env.local`. If unset, `proxiedFileUrl()` returns the raw GitHub URL and L4 is bypassed.

---

## 13. Mobile App

Located in `mobile/` — a separate **Expo / React Native** project.

| File | Role |
|---|---|
| `mobile/app/index.tsx` | File list screen |
| `mobile/app/search.tsx` | Search screen |
| `mobile/app/upload.tsx` | Upload screen |
| `mobile/app/settings.tsx` | Settings (API URL, token) |
| `mobile/lib/api.ts` | Fetch wrapper targeting the Next.js API |

Install dependencies separately:
```bash
cd mobile
npm install
npx expo start
```

---

## 14. Environment Variables

File: `.env.local` (never commit to git)

| Variable | Required | Description |
|---|---|---|
| `GITHUB_ID` | **Yes** | GitHub OAuth App Client ID |
| `GITHUB_SECRET` | **Yes** | GitHub OAuth App Client Secret |
| `AUTH_SECRET` | **Yes** | Random secret for NextAuth JWT signing |
| `NEXTAUTH_URL` | Yes (dev) | `http://localhost:3000` |
| `AUTH_TRUST_HOST` | Yes (dev) | `true` — required by Auth.js v5 on localhost |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash Redis URL for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis token |
| `NEXT_PUBLIC_CDN_WORKER_URL` | Optional | Cloudflare Worker URL for L4 CDN |
| `REDIS_URL` | Optional | Redis URL for BullMQ job queue |

**Get GitHub OAuth credentials:**
1. https://github.com/settings/developers → OAuth Apps → New OAuth App
2. Homepage URL: `http://localhost:3000`
3. Callback URL: `http://localhost:3000/api/auth/callback/github`

---

## 15. Running Locally

```bash
# 1. Install dependencies
cd gitstore
npm install

# 2. Fill in .env.local (see section 14)

# 3. Run the development server
npm run dev

# 4. Open in browser
# http://localhost:3000

# Build for production
npm run build
npm run start

# Deploy Cloudflare Worker (optional)
npx wrangler deploy
```

---

## 16. Known Limitations & Notes

| Item | Detail |
|---|---|
| **GitHub API rate limits** | GitHub limits unauthenticated calls to 60/h and authenticated to 5000/h. Heavy upload workloads may hit this. |
| **File size** | GitHub's Contents API supports files up to 100 MB. Files above ~1 MB should use the chunking path (automatic). |
| **No server storage** | GitStore is stateless — all data is in the user's GitHub repos. If `index.json` is deleted on GitHub, the index is gone. |
| **Encryption key storage** | The AES key is stored inside `index.json` in the user's private repo. Losing access to that repo means losing the ability to decrypt those files. |
| **Rate limiting without Redis** | `UPSTASH_REDIS_*` vars are optional; without them, rate limiting is silently disabled (logged as a warning). |
| **Middleware deprecation** | Next.js 16 renamed `middleware.ts` to `proxy.ts`. A deprecation warning appears at startup but functionality is unaffected until a future version removes support. |
| **Mobile dependencies** | The `mobile/` subproject has its own `package.json` and must be installed separately. Its React Native deps are not visible to the web project's TypeScript server. |
