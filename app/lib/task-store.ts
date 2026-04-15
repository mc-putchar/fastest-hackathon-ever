import { cloneTask, type Task } from "@/app/lib/domain";

declare global {
  var __dreamAgentTasks: Map<string, Task> | undefined;
}

function getTaskMap() {
  if (!globalThis.__dreamAgentTasks) {
    globalThis.__dreamAgentTasks = new Map<string, Task>();
  }

  return globalThis.__dreamAgentTasks;
}

export function saveTask(task: Task) {
  const tasks = getTaskMap();
  tasks.set(task.id, cloneTask(task));
  return cloneTask(task);
}

export function getTask(taskId: string) {
  const tasks = getTaskMap();
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
