import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, readRemoteIndex, assertOwner } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";
import { withErrorHandler } from "@/lib/error-handler";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

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

async function handler(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as any).accessToken;
  const login = (session as any).login;

  // 2. Owner assertion
  assertOwner(login, login);

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

  const octokit = createOctokit(accessToken);

  // Read index
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

  logger.info(`[download] hash=${hash} chunks=${paths.length} encrypted=${hasEncryption}`);

  const resultChunks: Uint8Array[] = [];

  for (let i = 0; i < paths.length; i++) {
    const chunkPath = paths[i];

    const { data } = await octokit.repos.getContent({
      owner: login,
      repo: targetRepo,
      path: chunkPath,
    });

    if (Array.isArray(data) || data.type !== "file") {
      throw new Error(`Invalid chunk data at index ${i}`);
    }

    let bytes: Uint8Array;
    const rawBase64 = data.content.replace(/\n/g, "").replace(/\r/g, "");

    if (rawBase64.length === 0) {
      if (!data.download_url) {
        throw new Error(`No download_url for chunk ${i}`);
      }
      const dlRes = await fetch(data.download_url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!dlRes.ok) {
        throw new Error(`Failed to fetch chunk ${i} from download_url: ${dlRes.status}`);
      }
      const arrayBuf = await dlRes.arrayBuffer();
      bytes = new Uint8Array(arrayBuf);
    } else {
      bytes = Uint8Array.from(Buffer.from(rawBase64, "base64"));
    }

    if (hasEncryption && record.encryptionKey) {
      const iv = ivList[i] ?? ivList[0];
      if (!iv) {
        throw new Error(`Missing IV for chunk ${i}`);
      }

      try {
        const decrypted = await decryptBuffer(bytes, record.encryptionKey, iv);
        resultChunks.push(decrypted);
        logger.debug(`[download] chunk ${i}: encrypted=${bytes.length} decrypted=${decrypted.length}`);
      } catch (err) {
        logger.error(`[download] Decryption failed chunk ${i}:`, err);
        return NextResponse.json(
          { error: "This file was uploaded with a bug that corrupted it. Please delete and re-upload." },
          { status: 422 }
        );
      }
    } else {
      resultChunks.push(bytes);
      logger.debug(`[download] chunk ${i}: raw=${bytes.length} (no encryption)`);
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

  logger.info(`[download] total bytes=${totalLength} type=${record.type}`);

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
}

export const GET = withErrorHandler(handler);
