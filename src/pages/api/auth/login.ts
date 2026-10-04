import type { APIRoute } from 'astro';
import { 
  verifyOwnerPassword, 
  createOwnerSession, 
  buildSessionCookieString,
  getOwnerEmail 
} from '../../../lib/access-control/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') || '';
  let email = '';
  let password = '';
  let role = 'owner';
  let redirectUrl = '/admin/access';

  if (contentType.includes('application/json')) {
    const json = await request.json();
    email = json.email || '';
    password = json.password || '';
    role = json.role || 'owner';
    redirectUrl = json.redirect || '/admin/access';
  } else {
    const formData = await request.formData();
    email = String(formData.get('email') || '');
    password = String(formData.get('password') || '');
    role = String(formData.get('role') || 'owner');
    redirectUrl = String(formData.get('redirect') || '/admin/access');
  }

  email = email.toLowerCase().trim();

  // Visitor self-assertion login is completely disabled in favor of verified Google OAuth
  if (role !== 'owner') {
    return new Response(JSON.stringify({ 
      error: 'Direct visitor credentials are disabled. Please use verified Google OAuth (/api/auth/google).' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle Owner Login
  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) {
    return new Response(JSON.stringify({ error: 'Owner access is not configured on this server.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (email !== ownerEmail) {
    if (!contentType.includes('application/json')) {
      return redirect(`/login?error=invalid_email&redirect=${encodeURIComponent(redirectUrl)}`);
    }
    return new Response(JSON.stringify({ error: 'Unrecognized owner email' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!verifyOwnerPassword(password)) {
    if (!contentType.includes('application/json')) {
      return redirect(`/login?error=invalid_passphrase&redirect=${encodeURIComponent(redirectUrl)}`);
    }
    return new Response(JSON.stringify({ error: 'Invalid passphrase' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = createOwnerSession(email);
  const cookie = buildSessionCookieString(session);

  if (contentType.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, session }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    });
  }

  const res = redirect(redirectUrl);
  res.headers.set('Set-Cookie', cookie);
  return res;
};
