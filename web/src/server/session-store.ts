const SESSION_TTL_MS = 30 * 60 * 1000 // 30 分钟

interface Session {
  xml: string
  expiresAt: number
}

export class SessionStore {
  private sessions = new Map<string, Session>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    // 每 5 分钟清理过期会话
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  set(sessionId: string, xml: string): void {
    this.sessions.set(sessionId, {
      xml,
      expiresAt: Date.now() + SESSION_TTL_MS,
    })
  }

  get(sessionId: string): string | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId)
      return null
    }
    return session.xml
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(id)
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer)
    this.sessions.clear()
  }
}
