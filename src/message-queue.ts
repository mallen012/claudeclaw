type QueuedTask = () => Promise<void>

const queues = new Map<string, QueuedTask[]>()
const processing = new Set<string>()

async function drain(chatId: string): Promise<void> {
  if (processing.has(chatId)) return
  processing.add(chatId)
  try {
    const q = queues.get(chatId)!
    while (q && q.length > 0) {
      const task = q.shift()!
      try {
        await task()
      } catch {
        /* swallow — individual tasks must log their own errors */
      }
    }
    queues.delete(chatId)
  } finally {
    processing.delete(chatId)
  }
}

export async function enqueue(chatId: string, task: QueuedTask): Promise<void> {
  let q = queues.get(chatId)
  if (!q) {
    q = []
    queues.set(chatId, q)
  }
  q.push(task)
  void drain(chatId)
}

export function queueLength(chatId: string): number {
  return queues.get(chatId)?.length ?? 0
}
