import { describe, expect, it } from 'vitest';
import { NodePool, type PoolableNode } from '@/audio/nodePool';

interface FakeNode extends PoolableNode {
  id: number;
  disconnectCalls: number;
}

function createFactory() {
  let created = 0;
  const factory = (): FakeNode => {
    created += 1;
    const node: FakeNode = {
      id: created,
      disconnectCalls: 0,
      disconnect() {
        node.disconnectCalls += 1;
      },
    };
    return node;
  };
  return { factory, created: () => created };
}

describe('NodePool', () => {
  it('空闲时复用同一节点，不重复创建', () => {
    const { factory, created } = createFactory();
    const pool = new NodePool<FakeNode>(factory);

    const first = pool.acquire();
    expect(created()).toBe(1);
    pool.release(first);
    expect(pool.idle).toBe(1);

    const second = pool.acquire();
    expect(second).toBe(first);
    expect(created()).toBe(1);
    expect(pool.idle).toBe(0);
  });

  it('release 会断开节点连接（避免残留路由）', () => {
    const { factory } = createFactory();
    const pool = new NodePool<FakeNode>(factory);
    const node = pool.acquire();
    pool.release(node);
    expect(node.disconnectCalls).toBe(1);
  });

  it('空闲数量受 limit 限制，超出部分直接丢弃', () => {
    const { factory } = createFactory();
    const pool = new NodePool<FakeNode>(factory, 2);
    const nodes = [pool.acquire(), pool.acquire(), pool.acquire()];
    for (const node of nodes) pool.release(node);
    expect(pool.idle).toBe(2);
    expect(pool.total).toBe(3);
  });

  it('clear 清空空闲队列', () => {
    const { factory } = createFactory();
    const pool = new NodePool<FakeNode>(factory);
    pool.release(pool.acquire());
    expect(pool.idle).toBe(1);
    pool.clear();
    expect(pool.idle).toBe(0);
  });

  it('并发借用时不会发出同一个节点', () => {
    const { factory } = createFactory();
    const pool = new NodePool<FakeNode>(factory);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });
});
