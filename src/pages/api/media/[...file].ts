import path from 'node:path';
import type { APIRoute } from 'astro';
import { evaluateMediaAccess, serveMediaFileResponse } from '../../../lib/access-control/media';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const rawFile = params.file || '';
  const cleanRelPath = rawFile.replace(/^\/+/, '');
  const mediaPath = '/' + cleanRelPath;

  const session = locals.session ?? null;
  const access = await evaluateMediaAccess(mediaPath, session);

  if (!access.allowed) {
    return new Response(JSON.stringify({ error: 'Access denied to protected media asset' }), {
      status: access.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fullPath = path.join(process.cwd(), 'private-media', cleanRelPath);
  return serveMediaFileResponse(fullPath, request);
};

export const HEAD: APIRoute = GET;
