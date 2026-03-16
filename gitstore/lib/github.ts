/**
 * lib/github.ts
 * Octokit wrapper — all GitHub API calls live here.
 * Never import Octokit or use access tokens outside this module.
 */

import { Octokit } from "@octokit/rest";
import type { DataNode, GitStoreIndex } from "@/types";
import { normalizeIndex } from "@/lib/index";

// ─── Repo name constants ──────────────────────────────────────────────────

export const MASTER_REPO = "gitstore-master";
export const SECONDARY_REPO = "gitstore-secondary";
export const INDEX_FILE_PATH = "index.json";
export const SHARD_SIZE_LIMIT_MB = 800;

const CHUNK_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

// ─── Factory ─────────────────────────────────────────────────────────────

export function createOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

// ─── Ownership guard ─────────────────────────────────────────────────────

/**
 * Assert that the session-authenticated user is the repo owner.
 * Throws a 403-flavoured Error if they differ, halting any route handler.
 * Every write route should call this before touching GitHub.
 *
 * Because every GitStore repo is created under the authenticated user's
 * own account, `sessionLogin === repoOwner` is always expected to be true.
 * This guard is a defence-in-depth measure against future code paths that
 * could inadvertently pass a different owner value.
 */
export function assertOwner(sessionLogin: string, repoOwner: string): void {
  if (sessionLogin !== repoOwner) {
    const err = new Error(
      `Forbidden: session user "${sessionLogin}" does not own repo "${repoOwner}"`
    );
    (err as NodeJS.ErrnoException).code = "FORBIDDEN";
    throw err;
  }
}

// ─── Repository helpers ───────────────────────────────────────────────────

/**
 * Ensure a repo exists; creates it if missing.
 * Returns the repo full_name.
 *
 * ENFORCEMENT: Every GitStore repo — master name-node, secondary name-node,
 * and every user data node — MUST be private with auto_init=true.
 * Never pass `private: false` here. Never create a public repo.
 */
export async function ensureRepo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string> {
  try {
    const { data } = await octokit.repos.get({ owner, repo });
    return data.full_name;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status !== 404) throw err;

    // ⚠️  ALWAYS private: true  — GitStore repos must never be public.
    // ⚠️  ALWAYS auto_init: true — seeds an initial commit so the tree
    //     is non-empty and file writes work immediately.
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name: repo,
      private: true,    // REQUIRED — never remove
      auto_init: true,  // REQUIRED — never remove
      description: `GitStore — ${repo}`,
    });
    return data.full_name;
  }
}

/**
 * Initialise the three system repos on first login:
 *   gitstore-master, gitstore-secondary, and one default data node.
 */
export async function bootstrapSystemRepos(
  octokit: Octokit,
  owner: string
): Promise<void> {
  await Promise.all([
    ensureRepo(octokit, owner, MASTER_REPO),
    ensureRepo(octokit, owner, SECONDARY_REPO),
    ensureRepo(octokit, owner, "gitstore-documents"), // first default data node
  ]);
}

// ─── index.json read / write ──────────────────────────────────────────────

/**
 * Read index.json from the master name-node repo.
 * Returns { content, sha } where sha is needed for subsequent writes.
 */
export async function readRemoteIndex(
  octokit: Octokit,
  owner: string
): Promise<{ content: GitStoreIndex; sha: string } | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo: MASTER_REPO,
      path: INDEX_FILE_PATH,
    });

    if (Array.isArray(data) || data.type !== "file") return null;

    const raw = Buffer.from(data.content, "base64").toString("utf-8");
    return { content: normalizeIndex(JSON.parse(raw) as GitStoreIndex), sha: data.sha };
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/**
 * Write index.json to master AND secondary name-node repos atomically.
 * Pass `sha` if updating an existing file; omit when creating for the first time.
 */
export async function writeRemoteIndex(
  octokit: Octokit,
  owner: string,
  index: GitStoreIndex,
  masterSha?: string
): Promise<void> {
  const payload = JSON.stringify({ ...index, updated_at: new Date().toISOString(), version: 1 }, null, 2);
  const content = Buffer.from(payload).toString("base64");

  // Write to master
  const masterResponse = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo: MASTER_REPO,
    path: INDEX_FILE_PATH,
    message: "chore: update index",
    content,
    ...(masterSha ? { sha: masterSha } : {}),
  });

  // Mirror to secondary (best-effort — do not fail upload if this fails)
  try {
    const secondaryFile = await readRemoteIndexFromRepo(octokit, owner, SECONDARY_REPO);
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: SECONDARY_REPO,
      path: INDEX_FILE_PATH,
      message: "chore: sync from master",
      content,
      ...(secondaryFile?.sha ? { sha: secondaryFile.sha } : {}),
    });
  } catch {
    // Secondary sync failure is non-fatal
    console.warn("[gitstore] Secondary name-node sync failed — will retry on next upload");
  }

  void masterResponse; // suppress unused var warning
}

async function readRemoteIndexFromRepo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ sha: string } | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: INDEX_FILE_PATH });
    if (Array.isArray(data) || data.type !== "file") return null;
    return { sha: data.sha };
  } catch {
    return null;
  }
}

// ─── File CRUD ────────────────────────────────────────────────────────────

export interface PutFileOptions {
  owner: string;
  repo: string;
  path: string;
  /** base64-encoded content */
  content: string;
  message?: string;
  /** SHA of existing file (required for updates) */
  sha?: string;
}

/**
 * Create or update a single file in a repo.
 * Returns the new blob SHA.
 */
export async function putFile(
  octokit: Octokit,
  options: PutFileOptions
): Promise<string> {
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner: options.owner,
    repo: options.repo,
    path: options.path,
    message: options.message ?? "chore: upload file",
    content: options.content,
    ...(options.sha ? { sha: options.sha } : {}),
  });
  return (data.content as { sha: string }).sha;
}

/**
 * Delete a file from a repo.
 */
export async function deleteFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  sha: string
): Promise<void> {
  await octokit.repos.deleteFile({
    owner,
    repo,
    path,
    message: "chore: delete file",
    sha,
  });
}

/**
 * Fetch the raw content of a file as a Blob.
 * Uses the raw.githubusercontent.com URL for efficiency.
 */
export async function getRawFileUrl(
  owner: string,
  repo: string,
  path: string,
  branch = "main"
): Promise<string> {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

/**
 * Upload chunks in batches of 4 (parallel) to respect rate limits.
 */
export async function uploadChunksBatched(
  octokit: Octokit,
  owner: string,
  repo: string,
  chunks: Array<{ path: string; content: string; sha?: string }>
): Promise<void> {
  const BATCH_SIZE = 4;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((chunk) =>
        putFile(octokit, {
          owner,
          repo,
          path: chunk.path,
          content: chunk.content,
          sha: chunk.sha,
        })
      )
    );
  }
}

// ─── Data node management ─────────────────────────────────────────────────

export async function createDataNodeRepo(
  octokit: Octokit,
  owner: string,
  nodeName: string,
  index?: GitStoreIndex
): Promise<DataNode> {
  const repo = `gitstore-${nodeName.toLowerCase().replace(/\s+/g, "-")}`;
  await ensureRepo(octokit, owner, repo);
  if (index) {
    if (!index.repoShards) index.repoShards = {};
    if (!index.repoShards[nodeName] || index.repoShards[nodeName].length === 0) {
      index.repoShards[nodeName] = [
        {
          nodeId: nodeName,
          repo,
          size_mb: 0,
          created: new Date().toISOString(),
          isCurrent: true,
        },
      ];
    }
  }
  return { id: nodeName, repo, size_mb: 0, created: new Date().toISOString() };
}

export async function getOrCreateCurrentShard(
  octokit: Octokit,
  owner: string,
  index: GitStoreIndex,
  nodeId: string
): Promise<string> {
  if (!index.repoShards) index.repoShards = {};
  const node = index.nodes[nodeId];
  if (!node) {
    throw new Error(`Node \"${nodeId}\" not found`);
  }

  const shards = index.repoShards[nodeId] ?? [];
  if (shards.length === 0) {
    index.repoShards[nodeId] = [
      {
        nodeId,
        repo: node.repo,
        size_mb: node.size_mb,
        created: node.created ?? new Date().toISOString(),
        isCurrent: true,
      },
    ];
    return node.repo;
  }

  let currentShard = shards.find((entry) => entry.isCurrent);
  if (!currentShard) {
    currentShard = shards[shards.length - 1];
    currentShard.isCurrent = true;
  }

  if (currentShard.size_mb < SHARD_SIZE_LIMIT_MB) {
    return currentShard.repo;
  }

  currentShard.isCurrent = false;
  const nextRepo = `gitstore-${nodeId}-${shards.length + 1}`;
  await ensureRepo(octokit, owner, nextRepo);

  const nextShard = {
    nodeId,
    repo: nextRepo,
    size_mb: 0,
    created: new Date().toISOString(),
    isCurrent: true,
  };
  shards.push(nextShard);
  index.repoShards[nodeId] = shards;

  return nextRepo;
}

// ─── Backup replication ───────────────────────────────────────────────────

/**
 * Replicate (mirror) a list of file blobs from sourceOwner to backupOwner.
 * Called asynchronously after each upload batch.
 */
export async function replicateToBackup(
  sourceOctokit: Octokit,
  backupOctokit: Octokit,
  sourceOwner: string,
  backupOwner: string,
  files: Array<{ repo: string; path: string }>
): Promise<void> {
  for (const file of files) {
    try {
      const { data } = await sourceOctokit.repos.getContent({
        owner: sourceOwner,
        repo: file.repo,
        path: file.path,
      });
      if (Array.isArray(data) || data.type !== "file") continue;

      // Ensure backup repo exists
      await ensureRepo(backupOctokit, backupOwner, file.repo);

      // Check if file already exists in backup
      let existingSha: string | undefined;
      try {
        const { data: existing } = await backupOctokit.repos.getContent({
          owner: backupOwner,
          repo: file.repo,
          path: file.path,
        });
        if (!Array.isArray(existing) && existing.type === "file") {
          existingSha = existing.sha;
        }
      } catch {
        // File doesn't exist in backup yet — that's fine
      }

      await putFile(backupOctokit, {
        owner: backupOwner,
        repo: file.repo,
        path: file.path,
        content: data.content.replace(/\n/g, ""),
        message: "chore: replicate from primary",
        sha: existingSha,
      });
    } catch (err) {
      console.error(`[gitstore] Replication failed for ${file.repo}/${file.path}:`, err);
    }
  }
}

export { CHUNK_SIZE_BYTES };
