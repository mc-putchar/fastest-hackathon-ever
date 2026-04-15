import { NextResponse } from "next/server";
import { rejectTask } from "@/app/lib/dream-agent";

export async function POST(_: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await context.params;
    const task = await rejectTask(taskId);
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reject the task." },
      { status: 400 },
    );
  }
}
