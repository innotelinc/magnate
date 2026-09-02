import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { aiConfigured, generateRecommendations } from "@/lib/ai";

export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI is not configured — set AI_API_KEY (and AI_API_URL/AI_MODEL)." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  try {
    const recommendations = await generateRecommendations(
      parsed.data.username,
    );
    if (recommendations.length === 0) {
      return NextResponse.json(
        { error: "The model returned no recommendations. Try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ recommendations });
  } catch (err) {
    console.error("recommendations failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Recommendations failed" },
      { status: 500 },
    );
  }
}