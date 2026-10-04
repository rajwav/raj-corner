import type { Visibility, AccessEvaluation, UserSession } from './types';
import { getStorage } from './storage';
import { isOwnerSession } from './auth';

export interface ResourceSpec {
  path: string;
  world?: string;
  visibility?: Visibility;
  allowRequests?: boolean;
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
  // Everything is private unless Raj has explicitly marked it public. This is
  // intentionally independent of old content that has no visibility field.
  const siteOverride = await storage.getVisibilityOverride('/');
  // An entry declared absolute-private stays owner-only unless Raj sets an
  // explicit override for that exact path; a site/world setting cannot weaken it.
  let effectiveVisibility: Visibility = pageOverride
    ? pageOverride.visibility
    : resource.visibility === 'absolute_private'
      ? 'absolute_private'
      : (siteOverride ? siteOverride.visibility : (resource.visibility || 'private'));
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

export async function filterVisibleEntries<T extends { id: string; data: { visibility?: Visibility; world?: string } }>(
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
      visibility: entry.data.visibility,
    }, session);
    if (evalResult.allowed) {
      results.push(entry);
    }
  }
  return results;
}
