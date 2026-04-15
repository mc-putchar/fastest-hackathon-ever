import { cloneTask, type Task } from "@/app/lib/domain";

const tasks = new Map<string, Task>();

export function saveTask(task: Task) {
  tasks.set(task.id, cloneTask(task));
  return cloneTask(task);
}

export function getTask(taskId: string) {
  const task = tasks.get(taskId);
  return task ? cloneTask(task) : null;
}

export function requireTask(taskId: string) {
  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found.`);
  }

  return task;
}
