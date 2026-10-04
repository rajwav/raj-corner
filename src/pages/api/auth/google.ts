import type { APIRoute } from 'astro';
import { 
  getOAuthRedirectUri, 
  buildOAuthStateCookieString, 
  isTemporaryVercelHostname, 
  CANONICAL_SITE_URL 
} from '../../../lib/access-control/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect, url }) => {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  const redirectTarget = url.searchParams.get('redirect') || '/';

  // Support local test mock mode if configured in automated tests
  if (import.meta.env.MOCK_GOOGLE_OAUTH === 'true') {
    const mockEmail = url.searchParams.get('mock_email') || 'test-google-user@example.com';
    const mockName = url.searchParams.get('mock_name') || 'Google Verified User';
    const mockVerified = url.searchParams.get('mock_verified') !== 'false';
    const mockCallback = `/api/auth/callback/google?mock=true&email=${encodeURIComponent(mockEmail)}&name=${encodeURIComponent(mockName)}&email_verified=${mockVerified}&redirect=${encodeURIComponent(redirectTarget)}`;
    return redirect(mockCallback);
  }

  // If request hits a temporary preview Vercel domain, redirect to canonical origin
  // so the oauth_state cookie is set on the exact domain that receives the callback.
  if (isTemporaryVercelHostname(url.hostname)) {
    return redirect(`${CANONICAL_SITE_URL}/api/auth/google${url.search}`);
  }

  if (!clientId) {
    return new Response(
      JSON.stringify({ 
        error: 'Google OAuth is not configured on this server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel or your environment variables.' 
      }), 
      { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  const stateData = JSON.stringify({
    redirect: redirectTarget,
    nonce: Math.random().toString(36).slice(2),
  });
  const state = Buffer.from(stateData).toString('base64url');

  const callbackUrl = getOAuthRedirectUri(url);

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', clientId);
  googleUrl.searchParams.set('redirect_uri', callbackUrl);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email profile');
  googleUrl.searchParams.set('state', state);
  googleUrl.searchParams.set('prompt', 'select_account');

  const response = redirect(googleUrl.toString());
  response.headers.set('Set-Cookie', buildOAuthStateCookieString(state, url));
  return response;
};
