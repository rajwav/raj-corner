import type { APIRoute } from 'astro';
import { 
  createVisitorSession, 
  createOwnerSession, 
  buildSessionCookieString, 
  getOwnerEmail,
  getOAuthRedirectUri
} from '../../../../lib/access-control/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect, url }) => {
  // 1. Check for automated test mock mode
  if (import.meta.env.MOCK_GOOGLE_OAUTH === 'true' && url.searchParams.get('mock') === 'true') {
    const email = url.searchParams.get('email') || '';
    const name = url.searchParams.get('name') || '';
    const isEmailVerified = url.searchParams.get('email_verified') === 'true';
    const redirectTarget = url.searchParams.get('redirect') || '/';

    if (!isEmailVerified) {
      return new Response(JSON.stringify({ 
        error: 'Google OAuth rejected: email is not verified by Google.' 
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const ownerEmail = getOwnerEmail();
    const isOwner = Boolean(ownerEmail && cleanEmail === ownerEmail);
    const session = isOwner ? createOwnerSession(cleanEmail) : createVisitorSession(cleanEmail, name);

    const cookie = buildSessionCookieString(session);
    const res = redirect(redirectTarget);
    res.headers.set('Set-Cookie', cookie);
    return res;
  }

  // 2. Real Google OAuth Callback flow
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return new Response(JSON.stringify({ error: 'Missing code or state from Google OAuth' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Verify CSRF state against oauth_state cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)oauth_state=([^;]+)/);
  const cookieState = match ? match[1] : null;

  if (!cookieState || cookieState !== state) {
    return new Response(JSON.stringify({ error: 'Invalid OAuth state (CSRF verification failed)' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let redirectTarget = '/';
  try {
    const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    if (parsedState.redirect && typeof parsedState.redirect === 'string') {
      redirectTarget = parsedState.redirect;
    }
  } catch {}

  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  const clientSecret = import.meta.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Google OAuth credentials not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const callbackUrl = getOAuthRedirectUri(url);

  // 4. Exchange authorization code for tokens with Google
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Google token exchange error:', errText);
    return redirect(`/login?error=token_exchange_failed`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // 5. Fetch verified profile from Google's OpenID UserInfo endpoint
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) {
    return redirect(`/login?error=userinfo_failed`);
  }

  const userInfo = await userRes.json();

  // 6. Strict check: Google MUST explicitly attest email_verified === true
  if (!userInfo.email || userInfo.email_verified !== true) {
    return new Response(JSON.stringify({ 
      error: 'Google account email is unverified. Google must verify email ownership before access can be requested.' 
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = userInfo.email.toLowerCase().trim();
  const name = userInfo.name || userInfo.email;
  const avatarUrl = typeof userInfo.picture === 'string' ? userInfo.picture : undefined;

  // 7. Mint session using existing UserSession structure
  const ownerEmail = getOwnerEmail();
  const isOwner = Boolean(ownerEmail && email === ownerEmail);
  const session = isOwner ? createOwnerSession(email) : createVisitorSession(email, name, avatarUrl);

  const sessionCookie = buildSessionCookieString(session);

  const res = redirect(redirectTarget);
  res.headers.set('Set-Cookie', sessionCookie);
  // Clear the state cookie
  res.headers.append('Set-Cookie', 'oauth_state=; Path=/; Max-Age=0; HttpOnly');
  return res;
};
