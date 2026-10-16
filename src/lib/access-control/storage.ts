import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AccessRequest, AccessGrant, PageVisibilityOverride } from './types';

export interface StorageData {
  requests: AccessRequest[];
  grants: AccessGrant[];
  visibilityOverrides: PageVisibilityOverride[];
}

export interface AccessStorage {
  isDurable(): boolean;
  getBackendType(): 'kv' | 'postgres' | 'file' | 'memory';
  getRequests(): Promise<AccessRequest[]>;
  getRequest(id: string): Promise<AccessRequest | null>;
  saveRequest(req: AccessRequest): Promise<void>;
  updateRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null>;
  getGrants(): Promise<AccessGrant[]>;
  getGrant(id: string): Promise<AccessGrant | null>;
  saveGrant(grant: AccessGrant): Promise<void>;
  updateGrant(id: string, updates: Partial<AccessGrant>): Promise<AccessGrant | null>;
  revokeGrant(id: string, revokedBy?: string): Promise<boolean>;
  restoreGrant(id: string): Promise<boolean>;
  getVisibilityOverrides(): Promise<PageVisibilityOverride[]>;
  getVisibilityOverride(path: string): Promise<PageVisibilityOverride | null>;
  setVisibilityOverride(override: PageVisibilityOverride): Promise<void>;
  exportData(): Promise<StorageData>;
}

// ─── Dual-Tier Local/Serverless File Storage ─────────────────────────────────
export class PersistentStorage implements AccessStorage {
  private baselinePath: string;
  private legacyPath: string;
  private writablePath: string;
  private cache: StorageData | null = null;
  private lastMtime = 0;
  private isServerless: boolean;

  constructor(customWritablePath?: string) {
    this.baselinePath = path.join(process.cwd(), 'src', 'data', 'access-store.json');
    this.legacyPath = path.join(process.cwd(), '.data', 'access-store.json');
    this.isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

    if (customWritablePath) {
      this.writablePath = customWritablePath;
    } else if (this.isServerless) {
      // In serverless, /tmp is only an ephemeral instance scratchpad
      this.writablePath = path.join('/tmp', 'raj-corner-access-store.json');
    } else {
      this.writablePath = this.baselinePath;
    }
  }

  isDurable(): boolean {
    // File storage in serverless is NOT durable across instances or redeployments
    return !this.isServerless;
  }

  getBackendType(): 'kv' | 'postgres' | 'file' | 'memory' {
    return 'file';
  }

  private async safeReadJson(filePath: string): Promise<StorageData | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
        grants: Array.isArray(parsed.grants) ? parsed.grants : [],
        visibilityOverrides: Array.isArray(parsed.visibilityOverrides) ? parsed.visibilityOverrides : [],
      };
    } catch {
      return null;
    }
  }

  private mergeData(base: StorageData, runtime: StorageData): StorageData {
    const requestsMap = new Map<string, AccessRequest>();
    base.requests.forEach(r => requestsMap.set(r.id, r));
    runtime.requests.forEach(r => requestsMap.set(r.id, r));

    const grantsMap = new Map<string, AccessGrant>();
    base.grants.forEach(g => grantsMap.set(g.id, g));
    runtime.grants.forEach(g => grantsMap.set(g.id, g));

    const overridesMap = new Map<string, PageVisibilityOverride>();
    base.visibilityOverrides.forEach(o => overridesMap.set(o.path, o));
    runtime.visibilityOverrides.forEach(o => overridesMap.set(o.path, o));

    return {
      requests: Array.from(requestsMap.values()),
      grants: Array.from(grantsMap.values()),
      visibilityOverrides: Array.from(overridesMap.values()),
    };
  }

  private async load(): Promise<StorageData> {
    let currentMtime = 0;
    try {
      const stat = await fs.stat(this.writablePath);
      currentMtime = stat.mtimeMs;
    } catch {
      currentMtime = 0;
    }

    if (this.cache && currentMtime === this.lastMtime && currentMtime > 0) {
      return this.cache;
    }

    let baseline = await this.safeReadJson(this.baselinePath);
    if (!baseline) {
      baseline = await this.safeReadJson(this.legacyPath);
    }
    if (!baseline) {
      baseline = { requests: [], grants: [], visibilityOverrides: [] };
    }

    if (this.writablePath !== this.baselinePath) {
      const runtime = await this.safeReadJson(this.writablePath);
      if (runtime) {
        this.cache = this.mergeData(baseline, runtime);
      } else {
        this.cache = { ...baseline };
        await this.persist(this.cache);
      }
    } else {
      this.cache = baseline;
    }


    this.lastMtime = currentMtime;
    return this.cache;
  }

  private async persist(data?: StorageData): Promise<void> {
    const toSave = data || this.cache;
    if (!toSave) return;

    try {
      await fs.mkdir(path.dirname(this.writablePath), { recursive: true });
      // Re-read current disk file before write to merge concurrent writes from other instances
      const latestOnDisk = await this.safeReadJson(this.writablePath);
      let merged = toSave;
      if (latestOnDisk) {
        merged = this.mergeData(latestOnDisk, toSave);
      }
      this.cache = merged;

      const tempPath = `${this.writablePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      await fs.writeFile(tempPath, JSON.stringify(merged, null, 2), 'utf-8');
      await fs.rename(tempPath, this.writablePath);

      if (!this.isServerless && this.writablePath !== this.legacyPath && this.writablePath === this.baselinePath) {
        try {
          await fs.mkdir(path.dirname(this.legacyPath), { recursive: true });
          await fs.writeFile(this.legacyPath, JSON.stringify(merged, null, 2), 'utf-8');
        } catch {}
      }

      const stat = await fs.stat(this.writablePath);
      this.lastMtime = stat.mtimeMs;
    } catch (e) {
      console.warn('Could not persist access-store to disk:', (e as Error).message);
    }
  }


  async getRequests(): Promise<AccessRequest[]> {
    const data = await this.load();
    return [...data.requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getRequest(id: string): Promise<AccessRequest | null> {
    const data = await this.load();
    return data.requests.find(r => r.id === id) || null;
  }

  async saveRequest(req: AccessRequest): Promise<void> {
    const data = await this.load();
    const idx = data.requests.findIndex(r => r.id === req.id);
    if (idx >= 0) {
      data.requests[idx] = req;
    } else {
      data.requests.push(req);
    }
    await this.persist(data);
  }

  async updateRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null> {
    const data = await this.load();
    const req = data.requests.find(r => r.id === id);
    if (!req) return null;
    Object.assign(req, updates, { updatedAt: new Date().toISOString() });
    await this.persist(data);
    return req;
  }

  async getGrants(): Promise<AccessGrant[]> {
    const data = await this.load();
    return [...data.grants].sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
  }

  async getGrant(id: string): Promise<AccessGrant | null> {
    const data = await this.load();
    return data.grants.find(g => g.id === id) || null;
  }

  async saveGrant(grant: AccessGrant): Promise<void> {
    const data = await this.load();
    const idx = data.grants.findIndex(g => g.id === grant.id);
    if (idx >= 0) {
      data.grants[idx] = grant;
    } else {
      data.grants.push(grant);
    }
    await this.persist(data);
  }

  async updateGrant(id: string, updates: Partial<AccessGrant>): Promise<AccessGrant | null> {
    const data = await this.load();
    const grant = data.grants.find(g => g.id === id);
    if (!grant) return null;
    Object.assign(grant, updates, { updatedAt: new Date().toISOString() });
    await this.persist(data);
    return grant;
  }

  async revokeGrant(id: string, revokedBy?: string): Promise<boolean> {
    const data = await this.load();
    const grant = data.grants.find(g => g.id === id);
    if (!grant) return false;
    grant.status = 'revoked';
    grant.revokedAt = new Date().toISOString();
    if (revokedBy) grant.revokedBy = revokedBy;
    await this.persist(data);
    return true;
  }

  async restoreGrant(id: string): Promise<boolean> {
    const data = await this.load();
    const grant = data.grants.find(g => g.id === id);
    if (!grant) return false;
    grant.status = 'active';
    grant.restoredAt = new Date().toISOString();
    grant.revokedAt = undefined;
    grant.revokedBy = undefined;
    await this.persist(data);
    return true;
  }

  async getVisibilityOverrides(): Promise<PageVisibilityOverride[]> {
    const data = await this.load();
    return [...data.visibilityOverrides];
  }

  async getVisibilityOverride(targetPath: string): Promise<PageVisibilityOverride | null> {
    const data = await this.load();
    const normalized = targetPath.replace(/\/+$/, '') || '/';
    return data.visibilityOverrides.find(o => o.path.replace(/\/+$/, '') === normalized) || null;
  }

  async setVisibilityOverride(override: PageVisibilityOverride): Promise<void> {
    const data = await this.load();
    const normalized = override.path.replace(/\/+$/, '') || '/';
    const idx = data.visibilityOverrides.findIndex(o => o.path.replace(/\/+$/, '') === normalized);
    if (idx >= 0) {
      data.visibilityOverrides[idx] = override;
    } else {
      data.visibilityOverrides.push(override);
    }
    await this.persist(data);
  }

  async exportData(): Promise<StorageData> {
    return this.load();
  }
}

// ─── Upstash Redis / Vercel KV REST Storage (Genuinely Durable & Atomic) ──────
export class VercelKvStorage implements AccessStorage {
  private url: string;
  private token: string;
  private grantsKey = 'raj_corner:grants';
  private requestsKey = 'raj_corner:requests';
  private overridesKey = 'raj_corner:overrides';
  private seeded = false;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
  }

  isDurable(): boolean {
    return true;
  }

  getBackendType(): 'kv' | 'postgres' | 'file' | 'memory' {
    return 'kv';
  }

  private async kvCommand(command: (string | number)[]): Promise<any> {
    const res = await fetch(`${this.url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`KV Error (${res.status}): ${err}`);
    }
    const json = await res.json();
    return json.result;
  }

  private parseHashResult<T>(result: any): T[] {
    if (!result) return [];
    if (Array.isArray(result)) {
      const items: T[] = [];
      for (let i = 1; i < result.length; i += 2) {
        try {
          items.push(JSON.parse(result[i]));
        } catch {}
      }
      return items;
    }
    if (typeof result === 'object') {
      return Object.values(result).map(val => (typeof val === 'string' ? JSON.parse(val) : val));
    }
    return [];
  }

  private async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    try {
      const count = await this.kvCommand(['HLEN', this.grantsKey]);
      if (Number(count) === 0) {
        // Seed from baseline store
        const baselinePath = path.join(process.cwd(), 'src', 'data', 'access-store.json');
        const raw = await fs.readFile(baselinePath, 'utf-8');
        const baseline: StorageData = JSON.parse(raw);

        for (const g of baseline.grants || []) {
          await this.kvCommand(['HSET', this.grantsKey, g.id, JSON.stringify(g)]);
        }
        for (const r of baseline.requests || []) {
          await this.kvCommand(['HSET', this.requestsKey, r.id, JSON.stringify(r)]);
        }
        for (const o of baseline.visibilityOverrides || []) {
          await this.kvCommand(['HSET', this.overridesKey, o.path, JSON.stringify(o)]);
        }
      }
      this.seeded = true;
    } catch (e) {
      console.warn('Could not seed KV store from baseline:', (e as Error).message);
    }
  }

  async getRequests(): Promise<AccessRequest[]> {
    await this.ensureSeeded();
    const result = await this.kvCommand(['HGETALL', this.requestsKey]);
    const list: AccessRequest[] = this.parseHashResult(result);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getRequest(id: string): Promise<AccessRequest | null> {
    await this.ensureSeeded();
    const raw = await this.kvCommand(['HGET', this.requestsKey, id]);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  async saveRequest(req: AccessRequest): Promise<void> {
    await this.ensureSeeded();
    await this.kvCommand(['HSET', this.requestsKey, req.id, JSON.stringify(req)]);
  }

  async updateRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null> {
    await this.ensureSeeded();
    const req = await this.getRequest(id);
    if (!req) return null;
    Object.assign(req, updates, { updatedAt: new Date().toISOString() });
    await this.kvCommand(['HSET', this.requestsKey, id, JSON.stringify(req)]);
    return req;
  }

  async getGrants(): Promise<AccessGrant[]> {
    await this.ensureSeeded();
    const result = await this.kvCommand(['HGETALL', this.grantsKey]);
    const list: AccessGrant[] = this.parseHashResult(result);
    return list.sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
  }

  async getGrant(id: string): Promise<AccessGrant | null> {
    await this.ensureSeeded();
    const raw = await this.kvCommand(['HGET', this.grantsKey, id]);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  async saveGrant(grant: AccessGrant): Promise<void> {
    await this.ensureSeeded();
    await this.kvCommand(['HSET', this.grantsKey, grant.id, JSON.stringify(grant)]);
  }

  async updateGrant(id: string, updates: Partial<AccessGrant>): Promise<AccessGrant | null> {
    await this.ensureSeeded();
    const grant = await this.getGrant(id);
    if (!grant) return null;
    Object.assign(grant, updates, { updatedAt: new Date().toISOString() });
    await this.kvCommand(['HSET', this.grantsKey, id, JSON.stringify(grant)]);
    return grant;
  }

  async revokeGrant(id: string, revokedBy?: string): Promise<boolean> {
    await this.ensureSeeded();
    const grant = await this.getGrant(id);
    if (!grant) return false;
    grant.status = 'revoked';
    grant.revokedAt = new Date().toISOString();
    if (revokedBy) grant.revokedBy = revokedBy;
    await this.kvCommand(['HSET', this.grantsKey, id, JSON.stringify(grant)]);
    return true;
  }

  async restoreGrant(id: string): Promise<boolean> {
    await this.ensureSeeded();
    const grant = await this.getGrant(id);
    if (!grant) return false;
    grant.status = 'active';
    grant.restoredAt = new Date().toISOString();
    grant.revokedAt = undefined;
    grant.revokedBy = undefined;
    await this.kvCommand(['HSET', this.grantsKey, id, JSON.stringify(grant)]);
    return true;
  }

  async getVisibilityOverrides(): Promise<PageVisibilityOverride[]> {
    await this.ensureSeeded();
    const result = await this.kvCommand(['HGETALL', this.overridesKey]);
    return this.parseHashResult(result);
  }

  async getVisibilityOverride(targetPath: string): Promise<PageVisibilityOverride | null> {
    await this.ensureSeeded();
    const normalized = targetPath.replace(/\/+$/, '') || '/';
    const raw = await this.kvCommand(['HGET', this.overridesKey, normalized]);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  async setVisibilityOverride(override: PageVisibilityOverride): Promise<void> {
    await this.ensureSeeded();
    const normalized = override.path.replace(/\/+$/, '') || '/';
    await this.kvCommand(['HSET', this.overridesKey, normalized, JSON.stringify({ ...override, path: normalized })]);
  }

  async exportData(): Promise<StorageData> {
    const [requests, grants, visibilityOverrides] = await Promise.all([
      this.getRequests(),
      this.getGrants(),
      this.getVisibilityOverrides(),
    ]);
    return { requests, grants, visibilityOverrides };
  }
}

// ─── In-Memory Storage for Pure Test Isolation ──────────────────────────────
export class MemoryAccessStorage implements AccessStorage {
  private data: StorageData;

  constructor(seed?: Partial<StorageData>) {
    this.data = {
      requests: seed?.requests ? JSON.parse(JSON.stringify(seed.requests)) : [],
      grants: seed?.grants ? JSON.parse(JSON.stringify(seed.grants)) : [],
      visibilityOverrides: seed?.visibilityOverrides ? JSON.parse(JSON.stringify(seed.visibilityOverrides)) : [],
    };
  }

  isDurable(): boolean {
    return false;
  }

  getBackendType(): 'kv' | 'postgres' | 'file' | 'memory' {
    return 'memory';
  }

  async getRequests(): Promise<AccessRequest[]> {
    return [...this.data.requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getRequest(id: string): Promise<AccessRequest | null> {
    return this.data.requests.find(r => r.id === id) || null;
  }

  async saveRequest(req: AccessRequest): Promise<void> {
    const idx = this.data.requests.findIndex(r => r.id === req.id);
    if (idx >= 0) this.data.requests[idx] = { ...req };
    else this.data.requests.push({ ...req });
  }

  async updateRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null> {
    const req = this.data.requests.find(r => r.id === id);
    if (!req) return null;
    Object.assign(req, updates, { updatedAt: new Date().toISOString() });
    return req;
  }

  async getGrants(): Promise<AccessGrant[]> {
    return [...this.data.grants].sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
  }

  async getGrant(id: string): Promise<AccessGrant | null> {
    return this.data.grants.find(g => g.id === id) || null;
  }

  async saveGrant(grant: AccessGrant): Promise<void> {
    const idx = this.data.grants.findIndex(g => g.id === grant.id);
    if (idx >= 0) this.data.grants[idx] = { ...grant };
    else this.data.grants.push({ ...grant });
  }

  async updateGrant(id: string, updates: Partial<AccessGrant>): Promise<AccessGrant | null> {
    const grant = this.data.grants.find(g => g.id === id);
    if (!grant) return null;
    Object.assign(grant, updates, { updatedAt: new Date().toISOString() });
    return grant;
  }

  async revokeGrant(id: string, revokedBy?: string): Promise<boolean> {
    const grant = this.data.grants.find(g => g.id === id);
    if (!grant) return false;
    grant.status = 'revoked';
    grant.revokedAt = new Date().toISOString();
    if (revokedBy) grant.revokedBy = revokedBy;
    return true;
  }

  async restoreGrant(id: string): Promise<boolean> {
    const grant = this.data.grants.find(g => g.id === id);
    if (!grant) return false;
    grant.status = 'active';
    grant.restoredAt = new Date().toISOString();
    grant.revokedAt = undefined;
    grant.revokedBy = undefined;
    return true;
  }

  async getVisibilityOverrides(): Promise<PageVisibilityOverride[]> {
    return [...this.data.visibilityOverrides];
  }

  async getVisibilityOverride(targetPath: string): Promise<PageVisibilityOverride | null> {
    const normalized = targetPath.replace(/\/+$/, '') || '/';
    return this.data.visibilityOverrides.find(o => o.path.replace(/\/+$/, '') === normalized) || null;
  }

  async setVisibilityOverride(override: PageVisibilityOverride): Promise<void> {
    const normalized = override.path.replace(/\/+$/, '') || '/';
    const idx = this.data.visibilityOverrides.findIndex(o => o.path.replace(/\/+$/, '') === normalized);
    if (idx >= 0) this.data.visibilityOverrides[idx] = { ...override, path: normalized };
    else this.data.visibilityOverrides.push({ ...override, path: normalized });
  }

  async exportData(): Promise<StorageData> {
    return JSON.parse(JSON.stringify(this.data));
  }
}

// ─── Storage Factory ────────────────────────────────────────────────────────
let instance: AccessStorage | null = null;

export function setStorageInstance(customInstance: AccessStorage | null): void {
  instance = customInstance;
}

export function getStorage(): AccessStorage {
  if (instance) return instance;

  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (kvUrl && kvToken) {
    instance = new VercelKvStorage(kvUrl, kvToken);
  } else {
    instance = new PersistentStorage();
  }

  return instance;
}
