import { NextResponse } from "next/server";
import { getTaskOrThrow } from "@/app/lib/dream-agent";

export async function GET(_: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await context.params;
    const task = getTaskOrThrow(taskId);
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Task not found." },
      { status: 404 },
    );
  }
}
