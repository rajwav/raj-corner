import type { APIRoute } from 'astro';
import { getSessionFromCookies, isOwnerSession } from '../../lib/access-control/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const session = getSessionFromCookies(request.headers.get('cookie'));
  if (!isOwnerSession(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Only the site owner can publish to the web.' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // Allow testing mode without touching git directly
  if (request.headers.get('x-test-mode') === 'true' || process.env.NODE_ENV === 'test') {
    return new Response(JSON.stringify({ ok: true, message: 'Test mode: Publish action authorized successfully.' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);
    const root = process.cwd();

    await execAsync('git add .', { cwd: root });
    const { stdout: status } = await execAsync('git status --porcelain', { cwd: root });
    if (!status.trim()) {
      return new Response(JSON.stringify({ ok: true, message: 'All changes are already published to GitHub!' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    await execAsync('git commit -m "Update content via Studio"', { cwd: root });
    await execAsync('git push origin main', { cwd: root });

    return new Response(JSON.stringify({ ok: true, message: 'Published! Pushed to GitHub and Vercel is updating now.' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err: any) {
    console.error('Publish error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to publish to GitHub' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
};
