import { NextResponse } from "next/server";
import { approveTask } from "@/app/lib/dream-agent";

export async function POST(_: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await context.params;
    const task = await approveTask(taskId);
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to approve the task." },
      { status: 400 },
    );
  }
}
