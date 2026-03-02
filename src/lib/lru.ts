import { Texture, ImageSource } from 'pixi.js'
import type { ImageResource } from 'pixi.js'

interface CacheEntry {
  url: string
  texture: Texture
}

/**
 * Least-Recently-Used cache for Pixi Textures.
 * Uses Map insertion-order: oldest entry is first, newest is last.
 * On eviction the texture (and its GPU source) is destroyed.
 */
export class TextureLRU {
  private capacity: number
  private cache = new Map<string, CacheEntry>()

  constructor(capacity = 100) {
    this.capacity = capacity
  }

  /** Retrieve a texture (and mark it as recently used). */
  get(key: string): Texture | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.texture
  }

  /** Insert or update a cache entry. Evicts oldest if at capacity. */
  set(key: string, url: string, texture: Texture): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    while (this.cache.size >= this.capacity) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.evict(oldest)
    }
    this.cache.set(key, { url, texture })
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  private evict(key: string): void {
    const entry = this.cache.get(key)
    if (entry) {
      this.cache.delete(key)
      entry.texture.destroy(true)
    }
  }

  /** Destroy every cached texture and clear the map. */
  destroy(): void {
    for (const entry of this.cache.values()) {
      entry.texture.destroy(true)
    }
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

/* ------------------------------------------------------------------ */
/*  Texture loader — manual fetch → ImageBitmap → Pixi Texture        */
/* ------------------------------------------------------------------ */

/**
 * Load a single frame as a Pixi Texture.
 * Uses fetch + createImageBitmap for off-main-thread decode,
 * then wraps the result in a Pixi ImageSource / Texture.
 */
export async function loadTexture(url: string): Promise<Texture> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const source = new ImageSource({ resource: bitmap as ImageResource })
  return new Texture({ source })
}
