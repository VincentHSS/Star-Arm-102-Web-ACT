const CACHE_NAME = 'star-arm-verified-mesh-v1';

// Keys include the file's content hash. Only verified public model bytes are
// written here; changing model data naturally selects a different cache entry.
export function createMeshAssetCache({ storage = globalThis.caches, maxMemoryBytes = 32 * 1024 * 1024 } = {}) {
  const memory = new Map();
  let memoryBytes = 0;
  function forget(key) {
    const existing = memory.get(key);
    if (existing) { memoryBytes -= existing.byteLength; memory.delete(key); }
  }
  function remember(key, bytes) {
    forget(key);
    if (bytes.byteLength > maxMemoryBytes) return;
    const copy = bytes.slice();
    memory.set(key, copy); memoryBytes += copy.byteLength;
    while (memoryBytes > maxMemoryBytes) forget(memory.keys().next().value);
  }
  return {
    async get(key) {
      const existing = memory.get(key);
      if (existing) { memory.delete(key); memory.set(key, existing); return existing.slice(); }
      try {
        const response = await (await storage?.open(CACHE_NAME))?.match(key);
        if (!response?.ok) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        // Verification happens in mesh_transport before cached bytes are used.
        return bytes;
      } catch { return null; }
    },
    async put(key, bytes) {
      remember(key, bytes);
      try {
        await (await storage?.open(CACHE_NAME))?.put(key, new Response(bytes, {
          headers: { 'Content-Type': 'application/octet-stream' },
        }));
      } catch { /* Quota limits or disabled storage must not block the model. */ }
    },
    async delete(key) {
      forget(key);
      try { await (await storage?.open(CACHE_NAME))?.delete(key); } catch {}
    },
  };
}

export const meshAssetCache = createMeshAssetCache();
