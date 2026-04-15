import { NextResponse } from "next/server";
import { createTaskFromMessage } from "@/app/lib/dream-agent";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { executionTarget?: "demo" | "live"; message?: string }
    | null;

  if (!body?.message?.trim()) {
    return NextResponse.json({ error: "A task message is required." }, { status: 400 });
  }

  const task = await createTaskFromMessage(body.message, body.executionTarget ?? "demo");
  return NextResponse.json({ task });
}
