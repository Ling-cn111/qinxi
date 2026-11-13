/**
 * 轻量节点池。
 *
 * BufferSourceNode 是一次性节点（start 后不可复用），真正值得复用和限制的是
 * 每声一个的 GainNode（以及降级链路里的滤波/失真节点）。池子只做两件事：
 * 复用空闲节点、限制常驻数量，避免快速连弹时不断新建/丢弃节点。
 */
export interface PoolableNode {
  disconnect: () => void;
}

export class NodePool<T extends PoolableNode> {
  private readonly free: T[] = [];
  private created = 0;

  constructor(
    private readonly factory: () => T,
    private readonly limit = 48,
  ) {}

  /** 空闲节点数 */
  get idle(): number {
    return this.free.length;
  }

  /** 累计创建过的节点数（用于观测是否真的复用了） */
  get total(): number {
    return this.created;
  }

  acquire(): T {
    const node = this.free.pop();
    if (node) return node;
    this.created += 1;
    return this.factory();
  }

  release(node: T): void {
    try {
      node.disconnect();
    } catch {
      /* 重复 disconnect 会抛错，忽略 */
    }
    if (this.free.length < this.limit) this.free.push(node);
  }

  clear(): void {
    this.free.length = 0;
  }
}
