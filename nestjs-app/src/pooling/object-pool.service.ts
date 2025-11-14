import { Injectable, Logger } from '@nestjs/common';

/**
 * Generic object pool for performance optimization
 * Reuses objects instead of creating/destroying them repeatedly
 */
@Injectable()
export class ObjectPoolService<T> {
  private readonly logger = new Logger(ObjectPoolService.name);
  private pools: Map<string, T[]> = new Map();
  private inUse: Map<string, Set<T>> = new Map();
  private factory: Map<string, () => T> = new Map();
  private reset: Map<string, (obj: T) => void> = new Map();
  private maxSize: Map<string, number> = new Map();

  /**
   * Register a pool for a specific object type
   */
  registerPool(
    poolName: string,
    factoryFn: () => T,
    resetFn: (obj: T) => void,
    initialSize: number = 10,
    maxSize: number = 100,
  ): void {
    this.factory.set(poolName, factoryFn);
    this.reset.set(poolName, resetFn);
    this.maxSize.set(poolName, maxSize);
    this.pools.set(poolName, []);
    this.inUse.set(poolName, new Set());

    // Pre-allocate initial objects
    for (let i = 0; i < initialSize; i++) {
      this.pools.get(poolName)!.push(factoryFn());
    }

    this.logger.log(
      `Registered pool '${poolName}' with ${initialSize} pre-allocated objects`,
    );
  }

  /**
   * Acquire an object from the pool
   */
  acquire(poolName: string): T | undefined {
    const pool = this.pools.get(poolName);
    const factory = this.factory.get(poolName);
    const inUseSet = this.inUse.get(poolName);
    const max = this.maxSize.get(poolName) || 100;

    if (!pool || !factory || !inUseSet) {
      this.logger.warn(`Pool '${poolName}' not registered`);
      return undefined;
    }

    let obj: T;

    if (pool.length > 0) {
      // Reuse from pool
      obj = pool.pop()!;
    } else if (inUseSet.size < max) {
      // Create new if under max size
      obj = factory();
      this.logger.debug(`Created new object for pool '${poolName}'`);
    } else {
      // Pool exhausted
      this.logger.warn(`Pool '${poolName}' exhausted (max: ${max})`);
      return undefined;
    }

    inUseSet.add(obj);
    return obj;
  }

  /**
   * Release an object back to the pool
   */
  release(poolName: string, obj: T): void {
    const pool = this.pools.get(poolName);
    const resetFn = this.reset.get(poolName);
    const inUseSet = this.inUse.get(poolName);

    if (!pool || !resetFn || !inUseSet) {
      this.logger.warn(`Pool '${poolName}' not registered`);
      return;
    }

    if (!inUseSet.has(obj)) {
      this.logger.warn(`Object not from pool '${poolName}'`);
      return;
    }

    // Reset object state
    resetFn(obj);

    // Return to pool
    inUseSet.delete(obj);
    pool.push(obj);
  }

  /**
   * Get pool statistics
   */
  getStats(poolName: string): {
    available: number;
    inUse: number;
    total: number;
    maxSize: number;
  } | undefined {
    const pool = this.pools.get(poolName);
    const inUseSet = this.inUse.get(poolName);
    const max = this.maxSize.get(poolName);

    if (!pool || !inUseSet || !max) {
      return undefined;
    }

    return {
      available: pool.length,
      inUse: inUseSet.size,
      total: pool.length + inUseSet.size,
      maxSize: max,
    };
  }

  /**
   * Clear a pool
   */
  clearPool(poolName: string): void {
    this.pools.delete(poolName);
    this.inUse.delete(poolName);
    this.factory.delete(poolName);
    this.reset.delete(poolName);
    this.maxSize.delete(poolName);
    this.logger.log(`Cleared pool '${poolName}'`);
  }

  /**
   * Clear all pools
   */
  clearAll(): void {
    this.pools.clear();
    this.inUse.clear();
    this.factory.clear();
    this.reset.clear();
    this.maxSize.clear();
    this.logger.log('Cleared all object pools');
  }

  /**
   * Get all registered pool names
   */
  getPoolNames(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Get all pool statistics
   */
  getAllStats(): Record<string, ReturnType<typeof this.getStats>> {
    const stats: Record<string, any> = {};

    for (const poolName of this.getPoolNames()) {
      stats[poolName] = this.getStats(poolName);
    }

    return stats;
  }
}
