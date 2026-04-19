#!/usr/bin/env node
import {
  insertMission,
  listMissions,
  setMissionEnabled,
  deleteMission,
  getMission,
} from './db.js'
import { nextCronRun } from './scheduler.js'

function usage(): void {
  console.log(`Usage:
  schedule list
  schedule create "<name>" "<prompt>" "<cron>" [chat_id] [agent_id] [priority]
  schedule once "<name>" "<prompt>" <unix_ms> [chat_id] [agent_id]
  schedule pause <id>
  schedule resume <id>
  schedule delete <id>
  schedule show <id>`)
}

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv
  switch (cmd) {
    case 'list': {
      const rows = listMissions()
      if (rows.length === 0) {
        console.log('(no missions)')
        return
      }
      for (const m of rows) {
        const status = m.enabled ? '✅' : '⏸️'
        const next = m.next_run ? new Date(m.next_run).toISOString() : '—'
        console.log(
          `${status} [${m.id}] ${m.name} (@${m.agent_id}, p${m.priority})\n` +
            `   cron: ${m.cron ?? 'one-shot'}\n   next: ${next}\n   last: ${m.last_status ?? '—'}`,
        )
      }
      return
    }
    case 'create': {
      const [name, prompt, cron, chatId, agentId, priority] = args
      if (!name || !prompt || !cron) {
        usage()
        process.exit(1)
      }
      const next = nextCronRun(cron)
      const id = insertMission({
        name,
        prompt,
        cron,
        chatId,
        agentId,
        priority: priority ? Number(priority) : 3,
        nextRun: next ?? undefined,
      })
      console.log(`created mission ${id}, next run ${next ? new Date(next).toISOString() : '—'}`)
      return
    }
    case 'once': {
      const [name, prompt, unixMsStr, chatId, agentId] = args
      if (!name || !prompt || !unixMsStr) {
        usage()
        process.exit(1)
      }
      const onceAt = Number(unixMsStr)
      const id = insertMission({ name, prompt, onceAt, chatId, agentId, nextRun: onceAt })
      console.log(`created one-shot mission ${id} at ${new Date(onceAt).toISOString()}`)
      return
    }
    case 'pause': {
      setMissionEnabled(Number(args[0]), false)
      console.log(`paused ${args[0]}`)
      return
    }
    case 'resume': {
      setMissionEnabled(Number(args[0]), true)
      console.log(`resumed ${args[0]}`)
      return
    }
    case 'delete': {
      deleteMission(Number(args[0]))
      console.log(`deleted ${args[0]}`)
      return
    }
    case 'show': {
      const m = getMission(Number(args[0]))
      if (!m) {
        console.log('not found')
        return
      }
      console.log(JSON.stringify(m, null, 2))
      return
    }
    default:
      usage()
      process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
