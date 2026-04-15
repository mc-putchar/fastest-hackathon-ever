import type { Task } from "@/app/lib/domain";
import type { ServiceExecutor } from "@/app/lib/executors/types";
import { appointmentHunterDemoExecutor } from "@/app/lib/executors/appointment-hunter/demo-executor";
import { appointmentHunterLiveExecutor } from "@/app/lib/executors/appointment-hunter/live-executor";

export function getExecutor(task: Task): ServiceExecutor {
  if (task.executionTarget === "live") {
    return appointmentHunterLiveExecutor;
  }

  return appointmentHunterDemoExecutor;
}
