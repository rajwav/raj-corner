import path from 'node:path';
import type { APIRoute } from 'astro';
import { evaluateMediaAccess, serveMediaFileResponse } from '../../lib/access-control/media';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const fileName = params.file || '';
  const mediaPath = '/images/' + fileName.replace(/^\/+/, '');

  const session = locals.session ?? null;
  const access = await evaluateMediaAccess(mediaPath, session);

  if (!access.allowed) {
    return new Response(JSON.stringify({ 
      error: 'Direct access to protected media is restricted. Please authenticate and request access to the corresponding entry.' 
    }), {
      status: access.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fullPath = path.join(process.cwd(), 'private-media/images', fileName);
  return serveMediaFileResponse(fullPath, request);
};

export const HEAD: APIRoute = GET;
