/**
 * app/api/files/download/route.ts
 * GET /api/files/download?hash=  — proxy-download a file through the server.
 * Decrypts each chunk server-side using the AES-256-GCM key from index.json.
 * Security: auth → assertOwner → Zod validation → rate limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, readRemoteIndex, assertOwner } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

// Server-side AES-256-GCM decryption using Node.js crypto
async function decryptBuffer(
  encryptedData: Buffer,
  base64Key: string,
  base64Iv: string
): Promise<Buffer> {
  const { subtle } = globalThis.crypto;

  // Import the key
  const rawKey = Uint8Array.from(Buffer.from(base64Key, "base64"));
  const cryptoKey = await subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Decode the IV
  const iv = Uint8Array.from(Buffer.from(base64Iv, "base64"));

  const cipherBytes = Uint8Array.from(encryptedData);

  // Decrypt
  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    cipherBytes
  );

  return Buffer.from(decrypted);
}

export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login       = (session as unknown as Record<string, string>).login;

  // 2. Owner assertion
  try { assertOwner(login, login); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Zod — validate hash query param
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
    const remote  = await readRemoteIndex(octokit, login);
    if (!remote) return NextResponse.json({ error: "Index not found" }, { status: 404 });

    const record = remote.content.files[hash];
    if (!record) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const nodeInfo = remote.content.nodes[record.node];
    if (!nodeInfo) return NextResponse.json({ error: "Node not found" }, { status: 404 });

    // Build list of chunks and their IVs
    const paths = record.chunks?.length ? record.chunks : [record.path];
    const ivList = record.iv ? record.iv.split(":") : [];
    const decryptedBuffers: Buffer[] = [];

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const { data } = await octokit.repos.getContent({
        owner: login,
        repo:  nodeInfo.repo,
        path,
      });

      if (Array.isArray(data) || data.type !== "file") {
        return NextResponse.json({ error: "Invalid file data" }, { status: 500 });
      }

      // GitHub returns content as base64 — decode to get the raw encrypted bytes
      const encryptedBuffer = Buffer.from(data.content.replace(/\n/g, ""), "base64");

      // Decrypt if encryption key and IV are present
      if (record.encryptionKey && ivList.length > 0) {
        const iv = ivList[i] ?? ivList[0]; // fallback to first IV if fewer IVs than chunks
        try {
          const decrypted = await decryptBuffer(encryptedBuffer, record.encryptionKey, iv);
          decryptedBuffers.push(decrypted);
        } catch (decryptErr) {
          console.error(`[download] Decryption failed for chunk ${i}:`, decryptErr);
          return NextResponse.json({ error: "Decryption failed" }, { status: 500 });
        }
      } else {
        // No encryption — use raw buffer
        decryptedBuffers.push(encryptedBuffer);
      }
    }

    const combined = Buffer.concat(decryptedBuffers);

    return new NextResponse(combined, {
      headers: {
        "Content-Type":        record.type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${record.name}"`,
        "Content-Length":      combined.length.toString(),
        "Cache-Control":       "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
