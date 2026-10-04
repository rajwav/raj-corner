import type { APIRoute } from 'astro';
import { getSessionFromCookies, isOwnerSession } from '../../../lib/access-control/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, redirect, url }) => {
  const session = getSessionFromCookies(request.headers.get('cookie'));
  if (!isOwnerSession(session)) {
    return new Response('Unauthorized: Studio controls are restricted to the site owner.', { status: 401 });
  }

  const active = url.searchParams.get('active');
  const targetRedirect = url.searchParams.get('redirect') || '/';

  if (active === '0') {
    cookies.set('raj_studio', '0', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  } else {
    cookies.set('raj_studio', '1', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  }

  return redirect(targetRedirect);
};
