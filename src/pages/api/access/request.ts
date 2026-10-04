import type { APIRoute } from 'astro';
import { getSessionFromCookies } from '../../../lib/access-control/auth';
import { getStorage } from '../../../lib/access-control/storage';
import type { AccessScope, AccessRequest } from '../../../lib/access-control/types';
import { evaluateAccess, normalizePath } from '../../../lib/access-control/policy';
import { getCollection } from 'astro:content';
import crypto from 'node:crypto';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = getSessionFromCookies(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'You must identify yourself before requesting access.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const contentType = request.headers.get('content-type') || '';
  let resourcePath = '';
  let worldSlug = '';
  let scope: AccessScope = 'page';
  let note = '';
  let redirectUrl = '/';

  if (contentType.includes('application/json')) {
    const json = await request.json();
    resourcePath = json.resourcePath || '';
    worldSlug = json.worldSlug || '';
    scope = (json.scope as AccessScope) || 'page';
    note = json.note || '';
    redirectUrl = json.redirect || resourcePath || '/';
  } else {
    const formData = await request.formData();
    resourcePath = String(formData.get('resourcePath') || '');
    worldSlug = String(formData.get('worldSlug') || '');
    scope = (formData.get('scope') as AccessScope) || 'page';
    note = String(formData.get('note') || '');
    redirectUrl = String(formData.get('redirect') || resourcePath || '/');
  }

  if (!resourcePath) {
    return new Response(JSON.stringify({ error: 'Resource path is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!['page', 'world', 'site'].includes(scope)) {
    return new Response(JSON.stringify({ error: 'Invalid access scope.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  resourcePath = normalizePath(resourcePath);
  worldSlug = worldSlug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (scope === 'world' && !worldSlug) {
    return new Response(JSON.stringify({ error: 'A world target is required for a world request.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Never allow a request to bypass an absolute-private policy.
  let entryVisibility: 'public' | 'private' | 'absolute_private' | undefined;
  if (resourcePath.startsWith('/entry/')) {
    const entryId = resourcePath.slice('/entry/'.length);
    const entry = (await getCollection('entries')).find(item => item.id === entryId);
    entryVisibility = entry?.data.visibility;
    worldSlug ||= entry?.data.world || '';
  }
  const requestedAccess = await evaluateAccess({ path: resourcePath, world: worldSlug || undefined, visibility: entryVisibility }, session);
  if (requestedAccess.visibility === 'absolute_private' || !requestedAccess.allowRequests) {
    return new Response(JSON.stringify({ error: 'This content is owner-only and cannot be requested.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const storage = getStorage();
  const now = new Date().toISOString();

  // Check if a request already exists for this user and resource
  const existingRequests = await storage.getRequests();
  const existing = existingRequests.find(r => 
    r.userEmail.toLowerCase() === session.email.toLowerCase() && 
    r.resourcePath === resourcePath && r.requestedScope === scope &&
    r.status === 'pending'
  );

  if (existing) {
    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true, request: existing }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(redirectUrl);
  }

  const newRequest: AccessRequest = {
    id: 'req_' + crypto.randomBytes(8).toString('hex'),
    userId: session.userId,
    userEmail: session.email,
    userName: session.name,
    resourcePath,
    worldSlug: worldSlug || undefined,
    requestedScope: scope,
    note: note.trim() || undefined,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await storage.saveRequest(newRequest);

  if (contentType.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, request: newRequest }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return redirect(redirectUrl);
};
