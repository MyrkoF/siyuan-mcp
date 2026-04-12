/**
 * Cache manager
 * Provides in-memory caching and performance optimization
 */

import logger from '../logger.js';

/**
 * Cache entry interface
 */
interface CacheItem<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache config interface
 */
export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  cleanupInterval: number;
  enableStats: boolean;
}

/**
 * Cache stats interface
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
  memoryUsage: number;
}

/**
 * Default cache config
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,
  defaultTTL: 300000, // 5 minutes
  cleanupInterval: 60000, // 1 minute
  enableStats: true
};

/**
 * In-memory cache manager
 */
export class MemoryCache<T = any> {
  private cache = new Map<string, CacheItem<T>>();
  private config: CacheConfig;
  private stats: CacheStats;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      hitRate: 0,
      memoryUsage: 0
    };

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Set cache entry
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const itemTTL = ttl || this.config.defaultTTL;

    // If cache is full, remove least used entries
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      timestamp: now,
      ttl: itemTTL,
      accessCount: 0,
      lastAccessed: now
    });

    this.updateStats();
  }

  /**
   * Get cache entry
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    const now = Date.now();
    
    // Check if expired
    if (now - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Update access info
    item.accessCount++;
    item.lastAccessed = now;
    
    this.stats.hits++;
    this.updateHitRate();
    
    return item.value;
  }

  /**
   * Delete cache entry
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.updateStats();
    return result;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.updateStats();
  }

  /**
   * Check if cache entry exists
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    
    const now = Date.now();
    if (now - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Get cache stats
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cache cleanup complete, removed ${removedCount} expired entries`);
      this.updateStats();
    }
  }

  /**
   * Remove least recently used entries (LRU)
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccessed < lruTime) {
        lruTime = item.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      logger.debug(`LRU evicted: ${lruKey}`);
    }
  }

  /**
   * Update stats
   */
  private updateStats(): void {
    this.stats.size = this.cache.size;
    this.updateHitRate();
    this.updateMemoryUsage();
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Update estimated memory usage
   */
  private updateMemoryUsage(): void {
    // Simple memory usage estimate
    this.stats.memoryUsage = this.cache.size * 1024; // assume 1KB per entry
  }

  /**
   * Destroy cache
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

/**
 * Global cache manager
 */
class CacheManager {
  private caches = new Map<string, MemoryCache>();

  /**
   * Get or create cache instance
   */
  getCache<T = any>(name: string, config?: Partial<CacheConfig>): MemoryCache<T> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new MemoryCache<T>(config));
    }
    return this.caches.get(name) as MemoryCache<T>;
  }

  /**
   * Destroy specific cache
   */
  destroyCache(name: string): boolean {
    const cache = this.caches.get(name);
    if (cache) {
      cache.destroy();
      return this.caches.delete(name);
    }
    return false;
  }

  /**
   * Destroy all caches
   */
  destroyAll(): void {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
  }

  /**
   * Get all cache stats
   */
  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    return stats;
  }
}

// Export global cache manager instance
export const cacheManager = new CacheManager();

// Export default cache instance
export const defaultCache = cacheManager.getCache('default');
