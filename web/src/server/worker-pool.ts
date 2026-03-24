import { type Subprocess } from "bun"
import { spawnLuaProcess, sendToLua, type LuaResult } from "./lua-bridge"

interface PoolWorker {
  proc: Subprocess<"pipe", "pipe", "pipe">
  busy: boolean
}

export class WorkerPool {
  private workers: PoolWorker[] = []
  private queue: Array<{
    xml: string
    resolve: (result: LuaResult) => void
    reject: (err: Error) => void
  }> = []
  private readonly size: number

  constructor(size = 4) {
    this.size = size
  }

  async warmup(): Promise<void> {
    console.log(`[WorkerPool] Starting ${this.size} LuaJIT workers...`)
    const startTime = Date.now()

    const promises = Array.from({ length: this.size }, async (_, i) => {
      const proc = spawnLuaProcess()
      // 等待进程就绪（给 HeadlessWrapper 初始化时间）
      await waitForReady(proc)
      this.workers.push({ proc, busy: false })
      console.log(`[WorkerPool] Worker ${i + 1} ready (${Date.now() - startTime}ms)`)
    })

    await Promise.all(promises)
    console.log(`[WorkerPool] All workers ready in ${Date.now() - startTime}ms`)
  }

  async calculate(xml: string): Promise<LuaResult> {
    const worker = this.workers.find((w) => !w.busy)
    if (worker) {
      return this.runOnWorker(worker, xml)
    }

    // 排队等待空闲 worker
    return new Promise((resolve, reject) => {
      this.queue.push({ xml, resolve, reject })
    })
  }

  private async runOnWorker(worker: PoolWorker, xml: string): Promise<LuaResult> {
    worker.busy = true
    try {
      const result = await sendToLua(worker.proc, xml)
      return result
    } catch (err) {
      // 进程崩溃，重建
      console.error("[WorkerPool] Worker crashed:", err)
      // 读取 stderr 以获取 Lua 错误信息
      try {
        const stderrReader = (worker.proc.stderr as ReadableStream<Uint8Array>).getReader()
        const chunks: Uint8Array[] = []
        while (true) {
          const { value, done } = await stderrReader.read()
          if (done || !value) break
          chunks.push(value)
        }
        stderrReader.releaseLock()
        if (chunks.length > 0) {
          const stderrText = new TextDecoder().decode(Buffer.concat(chunks))
          console.error("[WorkerPool] Lua stderr:", stderrText)
        }
      } catch {}
      try { worker.proc.kill() } catch {}
      worker.proc = spawnLuaProcess()
      await waitForReady(worker.proc)
      throw err
    } finally {
      worker.busy = false
      this.processQueue()
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0) return
    const worker = this.workers.find((w) => !w.busy)
    if (!worker) return

    const item = this.queue.shift()!
    this.runOnWorker(worker, item.xml).then(item.resolve).catch(item.reject)
  }

  shutdown(): void {
    for (const w of this.workers) {
      try { w.proc.kill() } catch {}
    }
    this.workers = []
  }
}

/**
 * 等待 LuaJIT 进程就绪。
 * POB HeadlessWrapper 加载完成后才能接受请求。
 * 策略：等待 2 秒（冷启动），如果进程已退出则抛出错误。
 */
async function waitForReady(proc: Subprocess): Promise<void> {
  // 等待一段时间让 HeadlessWrapper 完成初始化
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // 检查进程是否仍在运行
  if (proc.exitCode !== null) {
    // 尝试读取 stderr 以获取错误信息
    let errMsg = "LuaJIT process exited during startup"
    try {
      const stderrReader = (proc.stderr as ReadableStream<Uint8Array>).getReader()
      const { value } = await stderrReader.read()
      stderrReader.releaseLock()
      if (value) errMsg += ": " + new TextDecoder().decode(value)
    } catch {}
    throw new Error(errMsg)
  }
}
