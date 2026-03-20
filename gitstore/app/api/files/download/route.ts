/**
 * app/api/files/download/route.ts
 * GET /api/files/download?hash=
 *
 * Downloads a file from GitHub, decrypts it server-side, and returns plaintext.
 * Handles both single-file and chunked uploads.
 * Content stored in GitHub = base64(encrypted_bytes) — we decode then decrypt.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, readRemoteIndex, assertOwner } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

async function decryptBuffer(
  encryptedData: Uint8Array,
  base64Key: string,
  base64Iv: string
): Promise<Uint8Array> {
  const { subtle } = globalThis.crypto;

  const rawKey = Uint8Array.from(Buffer.from(base64Key, "base64"));
  const iv = Uint8Array.from(Buffer.from(base64Iv, "base64"));

  const cryptoKey = await subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const cipherBytes = new Uint8Array(encryptedData.length);
  cipherBytes.set(encryptedData);

  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    cipherBytes
  );

  return new Uint8Array(decrypted);
}

export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login = (session as unknown as Record<string, string>).login;

  // 2. Owner assertion
  try {
    assertOwner(login, login);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Validate hash
  const { searchParams } = new URL(req.url);
  const hashResult = z.string().min(1).max(64).safeParse(searchParams.get("hash"));
  if (!hashResult.success) {
    return NextResponse.json({ error: "Missing or invalid hash" }, { status: 400 });
  }
  const hash = hashResult.data;

  // 4. Rate limit
  const rl = await checkRateLimit(login, "default");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const octokit = createOctokit(accessToken);

    // Read index — this is the master index which still has encryptionKey
    const remote = await readRemoteIndex(octokit, login);
    if (!remote) {
      return NextResponse.json({ error: "Index not found" }, { status: 404 });
    }

    const record = remote.content.files[hash];
    if (!record) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const nodeInfo = remote.content.nodes[record.node];
    if (!nodeInfo) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }
    const targetRepo = record.repo ?? nodeInfo.repo;

    // Determine chunk paths and IVs
    const paths = record.chunks?.length ? record.chunks : [record.path];
    const ivList = record.iv ? record.iv.split(":") : [];
    const hasEncryption = !!(record.encryptionKey && ivList.length > 0);

    console.log(`[download] hash=${hash} chunks=${paths.length} encrypted=${hasEncryption}`);

    const resultChunks: Uint8Array[] = [];

    for (let i = 0; i < paths.length; i++) {
      const chunkPath = paths[i];

      const { data } = await octokit.repos.getContent({
        owner: login,
        repo: targetRepo,
        path: chunkPath,
      });

      if (Array.isArray(data) || data.type !== "file") {
        return NextResponse.json({ error: `Invalid chunk data at index ${i}` }, { status: 500 });
      }

      // GitHub stores content as base64 — strip newlines GitHub adds and decode
      const rawBase64 = data.content.replace(/\n/g, "").replace(/\r/g, "");
      const bytes = Uint8Array.from(Buffer.from(rawBase64, "base64"));

      if (hasEncryption && record.encryptionKey) {
        // Use per-chunk IV, fall back to first IV if not enough IVs stored
        const iv = ivList[i] ?? ivList[0];
        if (!iv) {
          console.error(`[download] No IV for chunk ${i}`);
          return NextResponse.json({ error: `Missing IV for chunk ${i}` }, { status: 500 });
        }

        try {
          const decrypted = await decryptBuffer(bytes, record.encryptionKey, iv);
          resultChunks.push(decrypted);
          console.log(`[download] chunk ${i}: encrypted=${bytes.length} decrypted=${decrypted.length}`);
        } catch (err) {
          console.error(`[download] Decryption failed chunk ${i}:`, err);
          const msg = err instanceof Error ? err.message : String(err);
          // "too small" / "too short" means the stored data is still base64 text
          // rather than raw encrypted bytes — this is an old double-encoded upload
          // that cannot be recovered.
          if (msg.toLowerCase().includes("too small") || msg.toLowerCase().includes("too short")) {
            return NextResponse.json(
              { error: "This file was uploaded with a bug that corrupted it. Please delete and re-upload." },
              { status: 422 }
            );
          }
          return NextResponse.json(
            { error: `Decryption failed for chunk ${i}: ${msg}` },
            { status: 500 }
          );
        }
      } else {
        // No encryption — raw bytes directly from GitHub
        // Guard: if bytes look like ASCII base64 text, this is a double-encoded old file
        const seemsDoubleEncoded = bytes.length > 0 && bytes.every(
          (b) => (b >= 65 && b <= 90) || (b >= 97 && b <= 122) ||
                 (b >= 48 && b <= 57) || b === 43 || b === 47 || b === 61
        );
        if (seemsDoubleEncoded) {
          return NextResponse.json(
            { error: "This file was uploaded with a bug that corrupted it. Please delete and re-upload." },
            { status: 422 }
          );
        }
        resultChunks.push(bytes);
        console.log(`[download] chunk ${i}: raw=${bytes.length} (no encryption)`);
      }
    }

    // Concatenate all chunks
    const totalLength = resultChunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of resultChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    console.log(`[download] total bytes=${totalLength} type=${record.type}`);

    return new NextResponse(combined, {
      status: 200,
      headers: {
        "Content-Type": record.type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(record.name)}"`,
        "Content-Length": totalLength.toString(),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[download] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
