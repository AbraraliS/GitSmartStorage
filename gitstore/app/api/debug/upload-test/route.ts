import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createOctokit, readRemoteIndex } from "@/lib/github";

/**
 * GET /api/debug/upload-test
 * Development-only endpoint to verify upload encoding is correct.
 * Visit after uploading a new file — likelyDoubleEncoded should be false.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login = (session as unknown as Record<string, string>).login;

  const octokit = createOctokit(accessToken);
  const remote = await readRemoteIndex(octokit, login);
  if (!remote) return NextResponse.json({ error: "No index found" });

  const files = Object.values(remote.content.files)
    .filter((f) => !f.trashed)
    .slice(0, 5);

  const results = [];

  for (const f of files) {
    const nodeInfo = remote.content.nodes[f.node];
    if (!nodeInfo) {
      results.push({ name: f.name, error: "Node not found" });
      continue;
    }

    try {
      const { data } = await octokit.repos.getContent({
        owner: login,
        repo: f.repo ?? nodeInfo.repo,
        path: f.path,
      });

      if (!Array.isArray(data) && data.type === "file") {
        const raw = data.content.replace(/[\n\r]/g, "");
        const decoded = Buffer.from(raw, "base64");

        // If the decoded bytes are all printable ASCII/base64 chars, it may be double-encoded
        const sample = decoded.slice(0, 100).toString("ascii");
        const isDoubleEncoded = /^[A-Za-z0-9+/=\r\n]+$/.test(sample) && decoded.length > 20;

        // Encrypted bytes (AES-GCM ciphertext) should have high entropy — random byte distribution
        const highByteCount = Array.from(decoded.slice(0, 100)).filter((b) => b > 127).length;

        results.push({
          name: f.name,
          node: f.node,
          fixedEncoding: f.fixedEncoding ?? false,
          hasEncryption: !!f.encryptionKey,
          storedBase64Len: raw.length,
          decodedBytes: decoded.length,
          firstBytesHex: decoded.slice(0, 12).toString("hex"),
          highByteCount,
          likelyDoubleEncoded: isDoubleEncoded && highByteCount < 5,
        });
      } else {
        results.push({ name: f.name, error: "Not a file or is a directory" });
      }
    } catch (e) {
      results.push({ name: f.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    message: "likelyDoubleEncoded:false means upload encoding is correct",
    files: results,
  });
}
