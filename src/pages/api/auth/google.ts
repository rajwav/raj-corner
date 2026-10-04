import type { APIRoute } from 'astro';

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

  const origin = import.meta.env.PUBLIC_SITE_URL || url.origin;
  const callbackUrl = `${origin}/api/auth/callback/google`;

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', clientId);
  googleUrl.searchParams.set('redirect_uri', callbackUrl);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email profile');
  googleUrl.searchParams.set('state', state);
  googleUrl.searchParams.set('prompt', 'select_account');

  const response = redirect(googleUrl.toString());
  const isProd = import.meta.env.PROD;
  response.headers.set(
    'Set-Cookie',
    `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isProd ? '; Secure' : ''}`
  );
  return response;
};
