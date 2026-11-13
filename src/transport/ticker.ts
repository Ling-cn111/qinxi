/**
 * 定时唤醒器。
 *
 * 它**不是时钟** —— 只是「该看一眼了」的闹钟。真正的时间一律从 `AudioContext.currentTime` 取，
 * 所以闹钟早来晚来都不影响音符的时刻，这正是前瞻调度能抵抗 timer 漂移的原因。
 *
 * 优先用 Web Worker 里的 `setInterval`：主线程的 timer 在后台标签页会被节流到 1s 一次，
 * 而 100ms 的前瞻窗撑不住 1s 的间隔（会漏音）；Worker 里的 interval 不受这个节流影响。
 * 环境不支持 Worker（例如 Node 里的单元测试）时回落到主线程 `setInterval`。
 */
export interface Ticker {
  /** 是否跑在 Worker 里 */
  readonly kind: 'worker' | 'interval';
  start(): void;
  stop(): void;
  dispose(): void;
}

export type TickerFactory = (onTick: () => void, intervalMs: number) => Ticker;

const WORKER_SOURCE = `
let timer = null;
self.onmessage = (event) => {
  const data = event.data || {};
  if (data.command === 'start') {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => self.postMessage('tick'), data.interval);
  } else if (data.command === 'stop') {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
};
`;

interface RunningTicker extends Ticker {
  poll?(): void;
}

function createIntervalTicker(onTick: () => void, intervalMs: number): RunningTicker {
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    kind: 'interval',
    start() {
      if (timer !== null) clearInterval(timer);
      timer = setInterval(onTick, intervalMs);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    dispose() {
      this.stop();
    },
    poll: onTick,
  };
}

function createWorkerTicker(onTick: () => void, intervalMs: number): RunningTicker | null {
  // 名字带 Ctor：避免局部变量遮蔽全局类型，`typeof Blob` 才不会自引用
  const { Worker: WorkerCtor, Blob: BlobCtor, URL: URLApi } = globalThis as {
    Worker?: typeof Worker;
    Blob?: typeof Blob;
    URL?: typeof URL;
  };
  if (!WorkerCtor || !BlobCtor || !URLApi?.createObjectURL) return null;

  let worker: Worker;
  let url: string;
  try {
    url = URLApi.createObjectURL(new BlobCtor([WORKER_SOURCE], { type: 'text/javascript' }));
    worker = new WorkerCtor(url);
  } catch {
    return null;
  }

  worker.onmessage = () => onTick();
  let running = false;

  return {
    kind: 'worker',
    start() {
      running = true;
      worker.postMessage({ command: 'start', interval: intervalMs });
    },
    stop() {
      if (!running) return;
      running = false;
      worker.postMessage({ command: 'stop' });
    },
    dispose() {
      this.stop();
      worker.terminate();
      URLApi.revokeObjectURL(url);
    },
    // 只给测试/调试用：手动催一次，不依赖真实计时器
    poll: onTick,
  };
}

/** 造一个唤醒器：优先 Worker，环境不允许时回落主线程 interval */
export function createTicker(onTick: () => void, intervalMs: number): Ticker {
  return createWorkerTicker(onTick, intervalMs) ?? createIntervalTicker(onTick, intervalMs);
}
