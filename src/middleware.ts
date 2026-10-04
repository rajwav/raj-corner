import { defineMiddleware } from 'astro:middleware';
import { getSessionFromCookies, isOwnerSession } from './lib/access-control/auth';
import { evaluateAccess } from './lib/access-control/policy';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) {
    return next();
  }

  const url = new URL(context.request.url);

  // Never intercept these routes — they must always render freely to avoid
  // redirect loops. /login itself, all /api/* endpoints (OAuth callback
  // included), and static asset gatekeepers are exempt.
  const exempt = ['/login', '/api/', '/uploads/', '/images/'];
  if (exempt.some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix))) {
    const cookieHeader = context.request.headers.get('cookie');
    context.locals.session = getSessionFromCookies(cookieHeader);
    context.locals.user = context.locals.session;
    return next();
  }

  const cookieHeader = context.request.headers.get('cookie');
  const session = getSessionFromCookies(cookieHeader);
  context.locals.session = session;
  context.locals.user = session;

  // Protect Admin dashboard routes — owner-only, always redirect to login.
  if (url.pathname.startsWith('/admin')) {
    if (!isOwnerSession(session)) {
      return context.redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
    }
  }

  // These pages contain aggregate private metadata (timeline, locations,
  // habits, etc.). Do this at the server boundary so an overlooked template
  // cannot accidentally leak it. Entry, world, and archive pages render their
  // own request-aware AccessGate.
  const protectedSections = ['/timeline', '/places', '/currently', '/rhythm', '/life-list', '/memories', '/explore', '/random'];
  if (protectedSections.some(section => url.pathname === section || url.pathname.startsWith(section + '/'))) {
    const access = await evaluateAccess({ path: url.pathname }, session);
    if (!access.allowed) {
      if (!session) {
        // Unauthenticated: send to login so the user can identify themselves.
        return context.redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
      }
      // Authenticated but not yet granted access: let the page render its own
      // AccessGate (locked/request-access screen). Redirecting here would loop.
      return next();
    }
  }

  return next();
});
