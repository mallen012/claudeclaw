import pino from 'pino'
import { LOG_LEVEL, NODE_ENV } from './config.js'

export const logger = pino({
  level: LOG_LEVEL,
  transport:
    NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
})

export function child(module: string) {
  return logger.child({ module })
}
