import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, assertOwner } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";
import { withErrorHandler } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WipeSchema = z.object({
  confirmationPhrase: z.string(), // must equal the user's GitHub login exactly
  token: z.string(),              // CSRF-style token generated server-side
});

async function handler(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as any).accessToken;
  const login       = (session as any).login;

  if (!accessToken || !login) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 401 });
  }

  // 2. Owner assertion
  assertOwner(login, login);

  // 3. Zod validation
  const body = WipeSchema.parse(await req.json());

  if (body.confirmationPhrase !== login) {
    return NextResponse.json({ error: "Confirmation phrase does not match username" }, { status: 403 });
  }

  if (!body.token) {
    return NextResponse.json({ error: "Missing CSRF token" }, { status: 403 });
  }

  // 4. Rate limit - 1 per hour per user
  const rl = await checkRateLimit(login, "wipe");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests — slow down" },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  const octokit = createOctokit(accessToken);

  // 5. List all repos for authenticated user matching gitstore-*
  const { data: repos } = await octokit.repos.listForAuthenticatedUser({
    per_page: 100,
    type: "owner",
  });
  const gitstoreRepos = repos.filter((r) => r.name.startsWith("gitstore-"));

  // 6. Delete each repo
  for (const repo of gitstoreRepos) {
    await octokit.repos.delete({ owner: login, repo: repo.name });
  }

  // 7. Return success
  return NextResponse.json({ 
    deleted: gitstoreRepos.map((r) => r.name), 
    count: gitstoreRepos.length 
  });
}

export const POST = withErrorHandler(handler);
