import { NextResponse } from "next/server";
import { appendTaskMessage } from "@/app/lib/dream-agent";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const body = (await request.json().catch(() => null)) as { message?: string } | null;

  if (!body?.message?.trim()) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  try {
    const { taskId } = await context.params;
    const task = await appendTaskMessage(taskId, body.message);
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the task." },
      { status: 400 },
    );
  }
}
