import crypto from 'node:crypto';
import type { UserSession, UserRole } from './types';

export const SESSION_COOKIE_NAME = 'raj_session';

function getServerEnv(name: string): string | undefined {
  // Astro loads .env values into import.meta.env for server modules. The
  // process fallback keeps direct Node-based checks working, but cannot
  // override a value Astro loaded from the project's .env file.
  const astroEnv = import.meta.env as Record<string, string | boolean | undefined> | undefined;
  const value = astroEnv?.[name];
  return typeof value === 'string' ? value : process.env[name];
}

/**
 * Production Secret Guardrail Accessors
 * In production (NODE_ENV=production), missing secrets MUST fail safely:
 * - No fallback secrets are permitted.
 * - Session creation is blocked.
 * - Owner access is strictly denied.
 */
export function getAuthSecret(): string | null {
  const secret = getServerEnv('AUTH_SECRET') || getServerEnv('SESSION_SECRET');
  if (!secret) {
    if (getServerEnv('PROD') === 'true' || getServerEnv('NODE_ENV') === 'production') {
      return null;
    }
    return 'dev-only-secret-do-not-use-in-production';
  }
  return secret;
}

export function getOwnerSecret(): string | null {
  const secret = getServerEnv('OWNER_SECRET') || getServerEnv('ADMIN_SECRET');
  if (!secret) {
    if (getServerEnv('PROD') === 'true' || getServerEnv('NODE_ENV') === 'production') {
      return null;
    }
    return 'dev-only-owner-passphrase';
  }
  return secret;
}

export function getOwnerEmail(): string | null {
  // Astro loads local .env values onto import.meta.env for server modules.
  // Using process.env here bypasses that loader in local dev and would select
  // the placeholder fallback instead of the configured Google owner account.
  const email = getServerEnv('OWNER_EMAIL');
  if (!email) {
    if (getServerEnv('PROD') === 'true' || getServerEnv('NODE_ENV') === 'production') {
      return null;
    }
    return 'raj@raj.example';
  }
  return email.toLowerCase().trim();
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function sign(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('base64url');
}

export function createSessionToken(session: UserSession): string {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error('[Security Guardrail] AUTH_SECRET is not configured. Session creation blocked.');
  }

  const payloadStr = JSON.stringify(session);
  const encodedPayload = base64UrlEncode(payloadStr);
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): UserSession | null {
  const secret = getAuthSecret();
  if (!secret) return null; // Fail safely in production if secret is missing

  if (!token || !token.includes('.')) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSig = sign(encodedPayload, secret);
  const expectedBuf = Buffer.from(expectedSig);
  const actualBuf = Buffer.from(signature);

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }

  try {
    const json = JSON.parse(base64UrlDecode(encodedPayload));
    if (!json.userId || !json.email || !json.role || !json.expiresAt) return null;
    if (Date.now() > json.expiresAt) return null; // Expired
    return json as UserSession;
  } catch {
    return null;
  }
}

export function getSessionFromCookies(cookieHeader: string | null): UserSession | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const session = verifySessionToken(decodeURIComponent(match[1]));

  // Changing OWNER_EMAIL must immediately retire a signed owner cookie for the
  // previous address. Otherwise a browser can appear to remain signed in as
  // the old placeholder owner until its 30-day expiry.
  if (session?.role === 'owner' && !isOwnerSession(session)) return null;

  return session;
}

export function buildSessionCookieString(session: UserSession, maxAgeSeconds: number = 30 * 24 * 60 * 60): string {
  const token = createSessionToken(session);
  const isProd = getServerEnv('PROD') === 'true' || getServerEnv('NODE_ENV') === 'production';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isProd ? '; Secure' : ''}`;
}

export function buildLogoutCookieString(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function isOwnerSession(session: UserSession | null | undefined): boolean {
  if (!session) return false;
  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) return false; // Fail safely in production if owner email is missing
  return session.role === 'owner' && session.email.toLowerCase().trim() === ownerEmail;
}

export function verifyOwnerPassword(password: string): boolean {
  if (!password) return false;
  const ownerSecret = getOwnerSecret();
  if (!ownerSecret) return false; // Fail safely in production if secret is missing

  const expected = Buffer.from(ownerSecret);
  const provided = Buffer.from(password);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

export function createVisitorSession(email: string, name?: string, avatarUrl?: string): UserSession {
  const cleanEmail = email.toLowerCase().trim();
  const cleanName = (name || cleanEmail.split('@')[0]).trim();
  const ownerEmail = getOwnerEmail();
  const isOwnerUser = Boolean(ownerEmail && cleanEmail === ownerEmail);

  return {
    userId: 'u_' + crypto.createHash('md5').update(cleanEmail).digest('hex').slice(0, 10),
    email: cleanEmail,
    name: cleanName,
    avatarUrl: avatarUrl || undefined,
    role: isOwnerUser ? 'owner' : 'visitor',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
}

export function createOwnerSession(email?: string): UserSession {
  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) {
    throw new Error('[Security Guardrail] OWNER_EMAIL is not configured. Owner session blocked.');
  }

  const effectiveEmail = (email || ownerEmail).toLowerCase().trim();
  if (effectiveEmail !== ownerEmail) {
    throw new Error('[Security Guardrail] Provided email does not match configured OWNER_EMAIL.');
  }

  return {
    userId: 'owner_raj',
    email: effectiveEmail,
    name: 'Raj',
    role: 'owner',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
}
