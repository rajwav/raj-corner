import type { APIRoute } from 'astro';
import { getSessionFromCookies, isOwnerSession } from '../../../lib/access-control/auth';
import { getStorage } from '../../../lib/access-control/storage';
import type { AccessScope, AccessGrant, Visibility } from '../../../lib/access-control/types';
import crypto from 'node:crypto';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = getSessionFromCookies(request.headers.get('cookie'));
  if (!isOwnerSession(session)) {
    return new Response(JSON.stringify({ error: 'Owner authorization required.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const contentType = request.headers.get('content-type') || '';
  let body: any = {};

  if (contentType.includes('application/json')) {
    body = await request.json();
  } else {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
  }

  const action = String(body.action || '');
  const storage = getStorage();
  const now = new Date().toISOString();

  // 1. APPROVE
  if (action === 'approve') {
    const requestId = String(body.requestId || '');
    const approvedScope = (body.scope as AccessScope) || 'page';
    if (!['page', 'world', 'site'].includes(approvedScope)) {
      return new Response(JSON.stringify({ error: 'Invalid grant scope.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const req = await storage.getRequest(requestId);
    if (!req) {
      return new Response(JSON.stringify({ error: 'Request not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine target based on scope
    let target = req.resourcePath;
    if (approvedScope === 'world') {
      target = req.worldSlug || 'travel';
    } else if (approvedScope === 'site') {
      target = '*';
    }

    const grant: AccessGrant = {
      id: 'g_' + crypto.randomBytes(8).toString('hex'),
      userEmail: req.userEmail.toLowerCase().trim(),
      userName: req.userName,
      scope: approvedScope,
      target,
      grantedBy: session?.email || 'owner',
      grantedAt: now,
      status: 'active',
    };

    await storage.saveGrant(grant);
    await storage.updateRequest(requestId, {
      status: 'approved',
      reviewedBy: session?.email || 'owner',
      reviewedAt: now,
    });

    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true, grant }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/admin/access?approved=' + encodeURIComponent(req.userEmail));
  }

  // 2. REJECT
  if (action === 'reject') {
    const requestId = String(body.requestId || '');
    const req = await storage.getRequest(requestId);
    if (!req) {
      return new Response(JSON.stringify({ error: 'Request not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await storage.updateRequest(requestId, {
      status: 'rejected',
      reviewedBy: session?.email || 'owner',
      reviewedAt: now,
    });

    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true, requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/admin/access?rejected=' + encodeURIComponent(req.userEmail));
  }

  // 3. REVOKE
  if (action === 'revoke') {
    const grantId = String(body.grantId || '');
    const success = await storage.revokeGrant(grantId);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Grant not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true, grantId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/admin/access?revoked=true');
  }

  // 4. DIRECT GRANT (Raj manually grants access to any email)
  if (action === 'grant_direct') {
    const email = String(body.email || '').toLowerCase().trim();
    const scope = (body.scope as AccessScope) || 'page';
    const target = String(body.target || '*').trim();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const grant: AccessGrant = {
      id: 'g_' + crypto.randomBytes(8).toString('hex'),
      userEmail: email,
      userName: String(body.name || email.split('@')[0]),
      scope,
      target,
      grantedBy: session?.email || 'owner',
      grantedAt: now,
      status: 'active',
    };

    await storage.saveGrant(grant);

    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true, grant }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/admin/access?granted=' + encodeURIComponent(email));
  }

  // 5. SET VISIBILITY OVERRIDE
  if (action === 'set_visibility') {
    const targetPath = String(body.path || '').trim();
    const visibility = (body.visibility as Visibility) || 'private';
    if (!['public', 'private', 'absolute_private'].includes(visibility)) {
      return new Response(JSON.stringify({ error: 'Invalid visibility.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!targetPath) {
      return new Response(JSON.stringify({ error: 'Path is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await storage.setVisibilityOverride({
      path: targetPath,
      visibility,
      updatedAt: now,
    });

    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true, path: targetPath, visibility }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/admin/access?visibility_set=' + encodeURIComponent(targetPath));
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
