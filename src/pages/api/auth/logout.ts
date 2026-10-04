import type { APIRoute } from 'astro';
import { buildLogoutCookieString } from '../../../lib/access-control/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  let redirectUrl = '/';
  try {
    const formData = await request.formData();
    redirectUrl = String(formData.get('redirect') || '/');
  } catch {}

  const cookie = buildLogoutCookieString();
  const res = redirect(redirectUrl);
  res.headers.set('Set-Cookie', cookie);
  return res;
};

export const GET: APIRoute = async ({ url, redirect }) => {
  const redirectUrl = url.searchParams.get('redirect') || '/';
  const cookie = buildLogoutCookieString();
  const res = redirect(redirectUrl);
  res.headers.set('Set-Cookie', cookie);
  return res;
};
