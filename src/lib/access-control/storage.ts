import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AccessRequest, AccessGrant, PageVisibilityOverride } from './types';

export interface StorageData {
  requests: AccessRequest[];
  grants: AccessGrant[];
  visibilityOverrides: PageVisibilityOverride[];
}

export interface AccessStorage {
  getRequests(): Promise<AccessRequest[]>;
  getRequest(id: string): Promise<AccessRequest | null>;
  saveRequest(req: AccessRequest): Promise<void>;
  updateRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null>;
  getGrants(): Promise<AccessGrant[]>;
  saveGrant(grant: AccessGrant): Promise<void>;
  revokeGrant(id: string): Promise<boolean>;
  getVisibilityOverrides(): Promise<PageVisibilityOverride[]>;
  getVisibilityOverride(path: string): Promise<PageVisibilityOverride | null>;
  setVisibilityOverride(override: PageVisibilityOverride): Promise<void>;
}

// ─── File-based Storage (Local Development & CI) ─────────────────────────────
class FileStorage implements AccessStorage {
  private filePath: string;
  private cache: StorageData | null = null;

  constructor() {
    this.filePath = path.join(process.cwd(), '.data', 'access-store.json');
  }

  private async load(): Promise<StorageData> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.cache = JSON.parse(raw);
      return this.cache!;
    } catch {
      this.cache = { requests: [], grants: [], visibilityOverrides: [] };
      return this.cache;
    }
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
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
    await this.persist();
  }

  async updateRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null> {
    const data = await this.load();
    const req = data.requests.find(r => r.id === id);
    if (!req) return null;
    Object.assign(req, updates, { updatedAt: new Date().toISOString() });
    await this.persist();
    return req;
  }

  async getGrants(): Promise<AccessGrant[]> {
    const data = await this.load();
    return [...data.grants].sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
  }

  async saveGrant(grant: AccessGrant): Promise<void> {
    const data = await this.load();
    const idx = data.grants.findIndex(g => g.id === grant.id);
    if (idx >= 0) {
      data.grants[idx] = grant;
    } else {
      data.grants.push(grant);
    }
    await this.persist();
  }

  async revokeGrant(id: string): Promise<boolean> {
    const data = await this.load();
    const grant = data.grants.find(g => g.id === id);
    if (!grant) return false;
    grant.status = 'revoked';
    grant.revokedAt = new Date().toISOString();
    await this.persist();
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
    await this.persist();
  }
}

// ─── Vercel KV / Upstash Redis REST Storage (Production) ────────────────────
class VercelKvStorage implements AccessStorage {
  private url: string;
  private token: string;
  private key = 'raj_corner:access_store';

  constructor(url: string, token: string) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
  }

  private async kvCommand(command: string[]): Promise<any> {
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

  private async load(): Promise<StorageData> {
    try {
      const val = await this.kvCommand(['GET', this.key]);
      if (!val) return { requests: [], grants: [], visibilityOverrides: [] };
      return typeof val === 'string' ? JSON.parse(val) : val;
    } catch (e) {
      console.error('Vercel KV read failed, using empty store:', e);
      return { requests: [], grants: [], visibilityOverrides: [] };
    }
  }

  private async persist(data: StorageData): Promise<void> {
    await this.kvCommand(['SET', this.key, JSON.stringify(data)]);
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
    if (idx >= 0) data.requests[idx] = req;
    else data.requests.push(req);
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

  async saveGrant(grant: AccessGrant): Promise<void> {
    const data = await this.load();
    const idx = data.grants.findIndex(g => g.id === grant.id);
    if (idx >= 0) data.grants[idx] = grant;
    else data.grants.push(grant);
    await this.persist(data);
  }

  async revokeGrant(id: string): Promise<boolean> {
    const data = await this.load();
    const grant = data.grants.find(g => g.id === id);
    if (!grant) return false;
    grant.status = 'revoked';
    grant.revokedAt = new Date().toISOString();
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
    if (idx >= 0) data.visibilityOverrides[idx] = override;
    else data.visibilityOverrides.push(override);
    await this.persist(data);
  }
}

// ─── Storage Factory ────────────────────────────────────────────────────────
let instance: AccessStorage | null = null;

export function getStorage(): AccessStorage {
  if (instance) return instance;

  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (kvUrl && kvToken) {
    instance = new VercelKvStorage(kvUrl, kvToken);
  } else {
    instance = new FileStorage();
  }

  return instance;
}
