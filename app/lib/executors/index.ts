import type { Task } from "@/app/lib/domain";
import type { ServiceExecutor } from "@/app/lib/executors/types";
import { burgeramtDemoExecutor } from "@/app/lib/executors/burgeramt/demo-executor";
import { burgeramtLiveExecutor } from "@/app/lib/executors/burgeramt/live-executor";

export function getExecutor(task: Task): ServiceExecutor {
  if (task.executionTarget === "live") {
    return burgeramtLiveExecutor;
  }

  return burgeramtDemoExecutor;
}
