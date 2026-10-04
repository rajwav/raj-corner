import type { UserSession } from './access-control/types.ts';
import { isOwnerSession } from './access-control/auth.ts';

/**
 * Default port / base URL for the local Capture editor workspace.
 * In development, Capture runs on port 4322.
 */
export const DEFAULT_CAPTURE_BASE_URL = 'http://localhost:4322';

/**
 * Returns true only if the user is authenticated as the owner and eligible for Studio mode.
 */
export function isStudioAccessible(session: UserSession | null | undefined): boolean {
  return isOwnerSession(session);
}

/**
 * Returns true if Studio mode is currently active for the owner.
 * If the user is not the authenticated owner, this always returns false.
 */
export function isStudioActive(
  session: UserSession | null | undefined,
  cookieVal?: string | null,
  searchParamStudio?: boolean
): boolean {
  if (!isOwnerSession(session)) return false;
  // If owner explicitly chose "View as Public", cookie is set to '0'
  if (cookieVal === '0' && !searchParamStudio) return false;
  return true;
}

/**
 * Generates the deep-link URL into the existing Capture editor for a given entry.
 * Clicking this from the Studio view opens the exact existing editor in Capture.
 */
export function getCaptureEditorUrl(entryId?: string, captureBase: string = DEFAULT_CAPTURE_BASE_URL): string {
  const base = captureBase.replace(/\/+$/, '');
  if (!entryId) return `${base}/#/entries`;
  const cleanId = entryId.trim().replace(/^\/?entry\//, '').replace(/^\/+|\/+$/g, '');
  return `${base}/#/editor/${encodeURIComponent(cleanId)}`;
}

/**
 * Generates the link to the Capture workspace home.
 */
export function getCaptureWorkspaceUrl(captureBase: string = DEFAULT_CAPTURE_BASE_URL): string {
  return captureBase.replace(/\/+$/, '') + '/';
}
