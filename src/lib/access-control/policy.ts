import type { Visibility, AccessEvaluation, UserSession } from './types';
import { getStorage } from './storage';
import { isOwnerSession } from './auth';

export interface ResourceSpec {
  path: string;
  world?: string;
  category?: string;
  type?: string;
  visibility?: Visibility;
  allowRequests?: boolean;
}

/**
 * Types that belong to the 'interests' (Things I Like) world.
 */
export const INTERESTS_ENTRY_TYPES = new Set([
  'car', 'music', 'book', 'movie', 'anime', 'series', 'space',
  'chess', 'game', 'sport', 'fitness', 'run', 'workout', 'challenge',
  'technology', 'obsession', 'collection'
]);

/**
 * Slugs of known entries in the 'interests' world.
 */
export const KNOWN_INTERESTS_SLUGS = new Set([
  'alan-walker-collection',
  'anime-collection',
  'astrophysics-and-the-deep-cosmos',
  'basketball-to-play',
  'bmw-m5',
  'call-of-duty-mobile',
  'challenge-be-consistent',
  'chess',
  'cricket',
  'eminem-collection',
  'exoplanets-and-extreme-worlds',
  'films-collection',
  'football-to-play',
  'kabaddi',
  'matiks',
  'operating-system-concepts-galvin',
  'porsche-911',
  'preet-re',
  'rolls-royce-ghost',
  'ruposh',
  'series-collection',
  'songs-for-the-road',
  'taqdeer-soundtrack',
  'technology-interests',
  'temporary-obsessions',
  'the-7-habits-of-highly-effective-people',
  'the-nature-of-time-and-relativity',
  'ty-i-ya-xcho'
]);

/**
 * Category IDs that belong to the 'interests' (Things I Like) world.
 */
export const INTEREST_CATEGORY_IDS = new Set([
  'interests',
  'music',
  'cars',
  'space',
  'books',
  'games',
  'sports',
  'fitness',
  'challenges',
  'movies-anime',
  'technology',
  'temporary-obsessions'
]);

/**
 * Returns true if the resource belongs to the 'interests' world.
 * Per user mandate, the ENTIRE Interests world (all current and future child
 * entries, categories, and landing page) defaults to completely PUBLIC.
 */
export function isInterestsResource(resource: ResourceSpec): boolean {
  const w = (resource.world || '').toLowerCase().trim();
  if (w === 'interests') return true;

  const c = (resource.category || '').toLowerCase().trim();
  if (c && INTEREST_CATEGORY_IDS.has(c)) return true;

  const t = (resource.type || '').toLowerCase().trim();
  if (t && INTERESTS_ENTRY_TYPES.has(t)) return true;

  const p = normalizePath(resource.path).toLowerCase();
  if (p === '/world/interests' || p.startsWith('/world/interests/')) return true;

  if (p.startsWith('/entry/')) {
    const slug = p.replace(/^\/entry\//, '').replace(/\/+$/, '');
    if (KNOWN_INTERESTS_SLUGS.has(slug)) return true;
  }

  return false;
}

export function isFitnessResource(resource: ResourceSpec): boolean {
  const t = (resource.type || '').toLowerCase().trim();
  if (t === 'run' || t === 'workout' || t === 'fitness') return true;

  const c = (resource.category || '').toLowerCase().trim();
  if (c === 'fitness') return true;

  const p = normalizePath(resource.path).toLowerCase();
  if (p.includes('/fitness')) return true;

  return false;
}

/**
 * The four top-level world landing pages that are explicitly public.
 * IMPORTANT: this makes ONLY /world/<slug> public, NOT their child entries.
 * Child entries are always evaluated independently with their own visibility.
 */
export const PUBLIC_WORLD_SLUGS = new Set(['life', 'travel', 'interests', 'making']);

/**
 * Returns true only when the path is the world landing page itself
 * (e.g. /world/life or /world/life/). Child entry paths like
 * /entry/some-slug are never matched.
 */
export function isPublicWorldLandingPath(path: string): boolean {
  const norm = normalizePath(path);
  for (const slug of PUBLIC_WORLD_SLUGS) {
    if (norm === `/world/${slug}`) return true;
  }
  return false;
}

export function normalizePath(p: string): string {
  if (!p) return '/';
  const clean = p.split('?')[0].replace(/\/+$/, '');
  return clean || '/';
}

export async function evaluateAccess(
  resource: ResourceSpec,
  session: UserSession | null | undefined
): Promise<AccessEvaluation> {
  const normPath = normalizePath(resource.path);
  const storage = getStorage();

  // 0. Public world landing pages are ALWAYS public — the page itself, not children.
  //    Child entries at /entry/* are evaluated separately with their own visibility.
  //    This check is path-exact: /world/life is public, but /entry/my-life-note is not.
  if (isPublicWorldLandingPath(normPath)) {
    return {
      allowed: true,
      visibility: 'public',
      reason: 'public',
      allowRequests: true,
    };
  }

  // 1. Check storage page override
  const pageOverride = await storage.getVisibilityOverride(normPath);
  // Everything is private unless Raj has explicitly marked it public, with the
  // intentional exception of the entire 'interests' (Things I Like) world, where
  // all child entries and categories default to PUBLIC per user mandate.
  const siteOverride = await storage.getVisibilityOverride('/');
  const defaultVisibility: Visibility = isInterestsResource(resource) ? 'public' : 'private';
  let effectiveVisibility: Visibility = pageOverride
    ? pageOverride.visibility
    : resource.visibility === 'absolute_private'
      ? 'absolute_private'
      : (siteOverride ? siteOverride.visibility : (resource.visibility || defaultVisibility));
  let allowRequests: boolean = resource.allowRequests !== false;

  // 2. Check world-level override if applicable
  if (!pageOverride && resource.visibility !== 'absolute_private' && resource.world) {
    const worldOverride = await storage.getVisibilityOverride(`/world/${resource.world}`);
    if (worldOverride) {
      effectiveVisibility = worldOverride.visibility;
    }
  }

  // 3. PUBLIC
  if (effectiveVisibility === 'public') {
    return {
      allowed: true,
      visibility: 'public',
      reason: 'public',
      allowRequests: true,
    };
  }

  // 4. OWNER bypasses all restrictions
  if (isOwnerSession(session)) {
    return {
      allowed: true,
      visibility: effectiveVisibility,
      reason: 'owner',
      allowRequests,
    };
  }

  // 5. ABSOLUTE_PRIVATE: Only owner can view, visitors cannot request
  if (effectiveVisibility === 'absolute_private') {
    return {
      allowed: false,
      visibility: 'absolute_private',
      reason: 'unauthorized_cannot_request',
      allowRequests: false,
    };
  }

  // 6. PRIVATE: Unauthenticated
  if (!session) {
    return {
      allowed: false,
      visibility: 'private',
      reason: 'unauthenticated',
      allowRequests,
    };
  }

  // 7. PRIVATE: Check active grants for this authenticated user
  const email = session.email.toLowerCase().trim();
  const allGrants = await storage.getGrants();
  const activeUserGrants = allGrants.filter(g => g.userEmail.toLowerCase().trim() === email && g.status === 'active');

  // Check SITE grant
  const siteGrant = activeUserGrants.find(g => g.scope === 'site');
  if (siteGrant) {
    return {
      allowed: true,
      visibility: 'private',
      reason: 'granted_site',
      matchedScope: 'site',
      allowRequests,
    };
  }

  // Check WORLD grant
  if (resource.world) {
    const worldGrant = activeUserGrants.find(g => g.scope === 'world' && g.target === resource.world);
    if (worldGrant) {
      return {
        allowed: true,
        visibility: 'private',
        reason: 'granted_world',
        matchedScope: 'world',
        allowRequests,
      };
    }
  }

  // Check PAGE grant
  const pageGrant = activeUserGrants.find(g => g.scope === 'page' && normalizePath(g.target) === normPath);
  if (pageGrant) {
    return {
      allowed: true,
      visibility: 'private',
      reason: 'granted_page',
      matchedScope: 'page',
      allowRequests,
    };
  }

  // 8. No grant: Check existing access requests
  const allRequests = await storage.getRequests();
  const userReq = allRequests.find(r => {
    if (r.userEmail.toLowerCase().trim() !== email) return false;
    if (r.requestedScope === 'site') return true;
    if (r.requestedScope === 'world') return Boolean(resource.world && r.worldSlug === resource.world);
    return normalizePath(r.resourcePath) === normPath;
  });

  if (userReq) {
    if (userReq.status === 'pending') {
      return {
        allowed: false,
        visibility: 'private',
        reason: 'pending',
        requestId: userReq.id,
        allowRequests,
      };
    }
    if (userReq.status === 'rejected') {
      return {
        allowed: false,
        visibility: 'private',
        reason: 'rejected',
        requestId: userReq.id,
        allowRequests,
      };
    }
  }

  return {
    allowed: false,
    visibility: 'private',
    reason: 'unauthorized_can_request',
    allowRequests,
  };
}

export async function filterVisibleEntries<T extends { id: string; data: { visibility?: Visibility; world?: string; type?: string; category?: string } }>(
  entriesList: T[],
  session: UserSession | null | undefined
): Promise<T[]> {
  if (isOwnerSession(session)) {
    return entriesList;
  }

  const results: T[] = [];
  for (const entry of entriesList) {
    const evalResult = await evaluateAccess({
      path: `/entry/${entry.id}`,
      world: entry.data.world,
      type: entry.data.type,
      category: entry.data.category,
      visibility: entry.data.visibility,
    }, session);
    if (evalResult.allowed) {
      results.push(entry);
    }
  }
  return results;
}
