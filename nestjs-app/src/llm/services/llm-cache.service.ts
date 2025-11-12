import { Injectable, Logger } from '@nestjs/common';
import {
  LLMResponse,
  StructuredLLMResponse,
} from '../interfaces/llm.interface';

interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  averageResponseTime: number;
  memoryUsage: number;
}

@Injectable()
export class LLMCacheService {
  private readonly logger = new Logger(LLMCacheService.name);
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 3600000; // 1 hour
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  private stats = {
    hits: 0,
    misses: 0,
    responseTimes: [] as number[],
  };

  constructor() {
    // Start periodic cleanup
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
    this.logger.log('LLM Cache service initialized');
  }

  /**
   * Get cached response for a prompt
   */
  async get(
    key: string,
  ): Promise<LLMResponse | StructuredLLMResponse<any> | null> {
    const startTime = Date.now();

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.stats.hits++;
    this.stats.responseTimes.push(Date.now() - startTime);

    this.logger.debug(`Cache hit for key: ${key}`);
    return entry.value;
  }

  /**
   * Cache a response
   */
  async set(
    key: string,
    value: LLMResponse | StructuredLLMResponse<any>,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    // Enforce cache size limit
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
    this.logger.debug(`Cached response for key: ${key}`);
  }

  /**
   * Generate cache key for a prompt and options
   */
  generateKey(prompt: string, options: any = {}, schema?: any): string {
    const keyComponents = {
      prompt: this.hashString(prompt),
      model: options.model || 'default',
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 2000,
      systemPrompt: options.systemPrompt
        ? this.hashString(options.systemPrompt)
        : '',
      schema: schema ? this.hashString(JSON.stringify(schema)) : '',
    };

    return `llm:${JSON.stringify(keyComponents)}`;
  }

  /**
   * Cache prompt-based responses with intelligent key generation
   */
  async cachePromptResponse(
    prompt: string,
    response: LLMResponse | StructuredLLMResponse<any>,
    options: any = {},
    schema?: any,
    customTTL?: number,
  ): Promise<void> {
    const key = this.generateKey(prompt, options, schema);
    const ttl = customTTL || this.calculateTTL(prompt, options);

    await this.set(key, response, ttl);
  }

  /**
   * Retrieve cached prompt response
   */
  async getCachedPromptResponse(
    prompt: string,
    options: any = {},
    schema?: any,
  ): Promise<LLMResponse | StructuredLLMResponse<any> | null> {
    const key = this.generateKey(prompt, options, schema);
    return this.get(key);
  }

  /**
   * Cache content generation responses (rooms, NPCs, etc.)
   */
  async cacheContentGeneration(
    type: 'room' | 'npc' | 'quest' | 'dialogue',
    parameters: any,
    result: any,
    customTTL?: number,
  ): Promise<void> {
    const key = this.generateContentKey(type, parameters);
    const ttl = customTTL || this.getContentTTL(type);

    await this.set(key, result, ttl);
  }

  /**
   * Retrieve cached content generation
   */
  async getCachedContentGeneration(
    type: 'room' | 'npc' | 'quest' | 'dialogue',
    parameters: any,
  ): Promise<any | null> {
    const key = this.generateContentKey(type, parameters);
    return this.get(key);
  }

  /**
   * Cache template compilations
   */
  async cacheTemplateCompilation(
    templateId: string,
    variables: Record<string, any>,
    compiled: any,
  ): Promise<void> {
    const key = `template:${templateId}:${this.hashString(JSON.stringify(variables))}`;
    // Template compilations have shorter TTL since they're fast to regenerate
    await this.set(key, compiled, 600000); // 10 minutes
  }

  /**
   * Retrieve cached template compilation
   */
  async getCachedTemplateCompilation(
    templateId: string,
    variables: Record<string, any>,
  ): Promise<any | null> {
    const key = `template:${templateId}:${this.hashString(JSON.stringify(variables))}`;
    return this.get(key);
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidate(pattern: string): Promise<number> {
    let deleted = 0;

    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    this.logger.log(
      `Invalidated ${deleted} cache entries matching pattern: ${pattern}`,
    );
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.log(`Cleared ${size} cache entries`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const averageResponseTime =
      this.stats.responseTimes.length > 0
        ? this.stats.responseTimes.reduce((a, b) => a + b, 0) /
          this.stats.responseTimes.length
        : 0;

    const memoryUsage = this.estimateMemoryUsage();

    return {
      totalEntries: this.cache.size,
      hitRate: hitRate,
      missRate: 1 - hitRate,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      averageResponseTime,
      memoryUsage,
    };
  }

  /**
   * Preemptively warm cache with common requests
   */
  async warmCache(
    warmupRequests: Array<{
      type: 'prompt' | 'content' | 'template';
      data: any;
    }>,
  ): Promise<void> {
    this.logger.log(`Warming cache with ${warmupRequests.length} requests`);

    for (const request of warmupRequests) {
      try {
        // This would typically involve making actual LLM calls
        // For now, we just create placeholder entries
        const key = this.generateWarmupKey(request);
        const placeholder: LLMResponse = {
          content: 'placeholder',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          model: 'placeholder',
          finishReason: 'stop',
          metadata: { warmedUp: true, timestamp: Date.now() },
        };
        await this.set(key, placeholder, this.DEFAULT_TTL);
      } catch (error) {
        this.logger.warn(`Failed to warm cache for request: ${error.message}`);
      }
    }
  }

  /**
   * Optimize cache by removing least valuable entries
   */
  async optimize(): Promise<void> {
    const entries = Array.from(this.cache.entries());

    // Sort by value (access count / age ratio)
    entries.sort(([, a], [, b]) => {
      const aValue = this.calculateEntryValue(a);
      const bValue = this.calculateEntryValue(b);
      return aValue - bValue;
    });

    // Remove bottom 25% if cache is getting full
    if (this.cache.size > this.MAX_CACHE_SIZE * 0.75) {
      const toRemove = Math.floor(entries.length * 0.25);

      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }

      this.logger.log(
        `Optimized cache by removing ${toRemove} low-value entries`,
      );
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let expired = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key);
        expired++;
      }
    }

    if (expired > 0) {
      this.logger.debug(`Cleaned up ${expired} expired cache entries`);
    }
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug(`Evicted LRU entry: ${oldestKey}`);
    }
  }

  private calculateTTL(prompt: string, options: any): number {
    // Dynamic TTL based on content type and complexity
    if (prompt.includes('generate') || prompt.includes('create')) {
      return 7200000; // 2 hours for generated content
    }

    if (options.temperature > 0.8) {
      return 1800000; // 30 minutes for high creativity
    }

    return this.DEFAULT_TTL;
  }

  private getContentTTL(type: string): number {
    switch (type) {
      case 'room':
        return 14400000; // 4 hours - rooms change less frequently
      case 'npc':
        return 10800000; // 3 hours - NPCs are fairly stable
      case 'quest':
        return 7200000; // 2 hours - quests may need updates
      case 'dialogue':
        return 3600000; // 1 hour - dialogue is more context-dependent
      default:
        return this.DEFAULT_TTL;
    }
  }

  private generateContentKey(type: string, parameters: any): string {
    const paramHash = this.hashString(JSON.stringify(parameters));
    return `content:${type}:${paramHash}`;
  }

  private generateWarmupKey(request: any): string {
    return `warmup:${request.type}:${this.hashString(JSON.stringify(request.data))}`;
  }

  private calculateEntryValue(entry: CacheEntry): number {
    const age = Date.now() - entry.timestamp;
    const accessFrequency = entry.accessCount / (age / 1000 / 60); // accesses per minute
    const recency = Date.now() - entry.lastAccessed;

    // Higher value = more valuable (higher access frequency, lower recency)
    return accessFrequency / (recency / 1000 / 60);
  }

  private estimateMemoryUsage(): number {
    let totalSize = 0;

    for (const entry of this.cache.values()) {
      totalSize += JSON.stringify(entry).length * 2; // Rough estimate (2 bytes per char)
    }

    return totalSize;
  }

  private hashString(str: string): string {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }
}
