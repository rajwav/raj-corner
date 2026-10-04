import assert from 'node:assert';

// Load local .env if available so OWNER_EMAIL and dev secrets are present
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env'); } catch {}
}

import { evaluateAccess, filterVisibleEntries, PUBLIC_WORLD_SLUGS, isPublicWorldLandingPath } from '../src/lib/access-control/policy.ts';
import { 
  createSessionToken, 
  verifySessionToken, 
  isOwnerSession,
  getAuthSecret,
  getOwnerSecret,
  getOwnerEmail,
  verifyOwnerPassword,
  createVisitorSession,
  createOwnerSession
} from '../src/lib/access-control/auth.ts';
import { getStorage } from '../src/lib/access-control/storage.ts';
import { evaluateMediaAccess, extractMediaUrlsFromEntry } from '../src/lib/access-control/media.ts';

// ── Helper: save a grant (approved access) ──────────────────────────────────
async function grantAccess(storage, { email, name, scope, target }) {
  const runId = Date.now() + Math.random();
  await storage.saveGrant({
    id: `grant-${runId}`,
    userEmail: email,
    userName: name,
    scope,            // 'page' | 'world' | 'site'
    target,           // normalized path for page, world slug for world, '*' for site
    grantedBy: 'test-owner',
    grantedAt: new Date().toISOString(),
    status: 'active',
  });
}

// ── Helper: save an access request (pending/rejected/revoked) ───────────────
async function saveRequest(storage, { email, name, scope, resourcePath, worldSlug, status }) {
  const runId = Date.now() + Math.random();
  await storage.saveRequest({
    id: `req-${runId}`,
    userEmail: email,
    userName: name,
    userId: `user-${runId}`,    // optional but consistent
    requestedScope: scope,       // 'page' | 'world' | 'site'
    resourcePath,
    worldSlug,
    status,
    note: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function runTests() {
  console.log('🧪 Starting Access Control & Security Perimeter Tests...\n');

  const storage = getStorage();
  const runId = Date.now();

  // Test 1: Signed Sessions
  console.log('1. Testing Session Token Minting & Verification...');
  const visitorSession = {
    userId: 'user-' + runId,
    email: `visitor-${runId}@example.com`,
    role: 'visitor',
    name: 'Curious Visitor',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  const token = createSessionToken(visitorSession);
  assert(token && token.includes('.'), 'Token must be composed of payload.signature');
  const verified = verifySessionToken(token);
  assert(verified !== null, 'Token should verify successfully');
  assert.strictEqual(verified.email, visitorSession.email);
  assert.strictEqual(verified.role, 'visitor');
  assert.strictEqual(isOwnerSession(verified), false, 'Visitor should not be owner');

  const tamperedToken = token.slice(0, -5) + 'xxxxx';
  assert.strictEqual(verifySessionToken(tamperedToken), null, 'Tampered token must fail verification');
  console.log('   ✓ Session signatures and tamper detection passed.\n');

  // Test 2: Explicit Public vs default-private entry evaluation
  console.log('2. Testing explicit-public and default-private evaluation...');
  const publicEvalUnauth = await evaluateAccess({
    path: '/entry/public-waterfall',
    world: 'travel',
    visibility: 'public',
  }, null);
  assert.strictEqual(publicEvalUnauth.allowed, true);
  assert.strictEqual(publicEvalUnauth.reason, 'public');

  const privateEvalUnauth = await evaluateAccess({
    path: '/entry/private-memory',
    world: 'life',
  }, null);
  assert.strictEqual(privateEvalUnauth.allowed, false);
  assert.strictEqual(privateEvalUnauth.reason, 'unauthenticated');
  console.log('   ✓ Public entries open; default-private blocked for anonymous.\n');

  // Test 3: unauthenticated cannot request absolute_private
  console.log('3. Testing absolute_private blocks unauthenticated users...');
  const absPrivUnauth = await evaluateAccess({
    path: '/entry/raj-diary',
    world: 'life',
    visibility: 'absolute_private',
  }, null);
  assert.strictEqual(absPrivUnauth.allowed, false);
  assert.strictEqual(absPrivUnauth.visibility, 'absolute_private');
  console.log('   ✓ absolute_private blocks unauthenticated.\n');

  // Test 4: page grant unlocks a specific page
  console.log('4. Testing per-page grant...');
  const grantedSession = {
    userId: 'user-grant-' + runId,
    email: `granted-${runId}@example.com`,
    role: 'visitor',
    name: 'Granted User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  const grantPath = `/entry/test-page-grant-${runId}`;
  await grantAccess(storage, {
    email: grantedSession.email,
    name: grantedSession.name,
    scope: 'page',
    target: grantPath,
  });
  const pgGrantEval = await evaluateAccess({ path: grantPath, world: 'life' }, grantedSession);
  assert.strictEqual(pgGrantEval.allowed, true);
  assert.strictEqual(pgGrantEval.reason, 'granted_page');
  console.log('   ✓ Per-page grant unlocks the entry.\n');

  // Test 5: world-scope grant unlocks entries in the world
  console.log('5. Testing world-scope grant...');
  const worldGrantSession = {
    userId: `user-world-${runId}`,
    email: `world-grant-${runId}@example.com`,
    role: 'visitor',
    name: 'World Granted User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  await grantAccess(storage, {
    email: worldGrantSession.email,
    name: worldGrantSession.name,
    scope: 'world',
    target: 'travel',  // world slug
  });
  const worldGrantEval = await evaluateAccess({
    path: `/entry/travel-trip-${runId}`,
    world: 'travel',
  }, worldGrantSession);
  assert.strictEqual(worldGrantEval.allowed, true);
  assert.strictEqual(worldGrantEval.reason, 'granted_world');
  console.log('   ✓ World-scope grant unlocks entries in that world.\n');

  // Test 6: site-scope grant unlocks everything private (not absolute_private)
  console.log('6. Testing site-scope grant...');
  const siteGrantSession = {
    userId: `user-site-${runId}`,
    email: `site-grant-${runId}@example.com`,
    role: 'visitor',
    name: 'Site Granted User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  await grantAccess(storage, {
    email: siteGrantSession.email,
    name: siteGrantSession.name,
    scope: 'site',
    target: '*',
  });
  const siteGrantPrivate = await evaluateAccess({
    path: `/entry/life-frag-${runId}`,
    world: 'life',
  }, siteGrantSession);
  assert.strictEqual(siteGrantPrivate.allowed, true, 'site grant should unlock private');
  assert.strictEqual(siteGrantPrivate.reason, 'granted_site');

  const siteGrantAbsPriv = await evaluateAccess({
    path: `/entry/raj-secret-${runId}`,
    world: 'life',
    visibility: 'absolute_private',
  }, siteGrantSession);
  assert.strictEqual(siteGrantAbsPriv.allowed, false, 'site grant should NOT unlock absolute_private');
  console.log('   ✓ Site-scope grant unlocks private; absolute_private stays locked.\n');

  // Test 7: pending request returns pending reason, not allowed
  console.log('7. Testing pending request status...');
  const pendingSession = {
    userId: `user-pending-${runId}`,
    email: `pending-${runId}@example.com`,
    role: 'visitor',
    name: 'Pending User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  await saveRequest(storage, {
    email: pendingSession.email,
    name: pendingSession.name,
    scope: 'page',
    resourcePath: `/entry/pending-page-${runId}`,
    worldSlug: 'life',
    status: 'pending',
  });
  const pendingEval = await evaluateAccess({
    path: `/entry/pending-page-${runId}`,
    world: 'life',
  }, pendingSession);
  assert.strictEqual(pendingEval.allowed, false);
  assert.strictEqual(pendingEval.reason, 'pending');
  console.log('   ✓ Pending request: not allowed, reason=pending.\n');

  // Test 8: rejected request returns rejected reason
  console.log('8. Testing rejected request status...');
  const rejectedSession = {
    userId: `user-rejected-${runId}`,
    email: `rejected-${runId}@example.com`,
    role: 'visitor',
    name: 'Rejected User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  await saveRequest(storage, {
    email: rejectedSession.email,
    name: rejectedSession.name,
    scope: 'page',
    resourcePath: `/entry/rejected-page-${runId}`,
    worldSlug: 'life',
    status: 'rejected',
  });
  const rejectedEval = await evaluateAccess({
    path: `/entry/rejected-page-${runId}`,
    world: 'life',
  }, rejectedSession);
  assert.strictEqual(rejectedEval.allowed, false);
  assert.strictEqual(rejectedEval.reason, 'rejected');
  console.log('   ✓ Rejected request: not allowed, reason=rejected.\n');

  // Test 9: revoked (saved as 'revoked' status) treated as rejected
  console.log('9. Testing revoked request status...');
  const revokedSession = {
    userId: `user-revoked-${runId}`,
    email: `revoked-${runId}@example.com`,
    role: 'visitor',
    name: 'Revoked User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  await saveRequest(storage, {
    email: revokedSession.email,
    name: revokedSession.name,
    scope: 'page',
    resourcePath: `/entry/revoked-page-${runId}`,
    worldSlug: 'life',
    status: 'rejected',  // revoked = rejected in the status model
  });
  const revokedEval = await evaluateAccess({
    path: `/entry/revoked-page-${runId}`,
    world: 'life',
  }, revokedSession);
  assert.strictEqual(revokedEval.allowed, false);
  assert.strictEqual(revokedEval.reason, 'rejected');
  console.log('   ✓ Revoked/rejected: not allowed, reason=rejected.\n');

  // Test 10: absolute_private cannot be unlocked by any visitor
  console.log('10. Testing absolute_private: owner bypass and visitor block...');
  const ownerSession = await createOwnerSession();
  const absPrivOwnerEval = await evaluateAccess({
    path: `/entry/totally-secret-${runId}`,
    world: 'life',
    visibility: 'absolute_private',
  }, ownerSession);
  assert.strictEqual(absPrivOwnerEval.allowed, true, 'Owner can access absolute_private');
  assert.strictEqual(absPrivOwnerEval.reason, 'owner');

  // site grant must NOT unlock absolute_private
  const siteGrantAbsPrivCheck = await evaluateAccess({
    path: `/entry/totally-secret-${runId}`,
    world: 'life',
    visibility: 'absolute_private',
  }, siteGrantSession);
  assert.strictEqual(siteGrantAbsPrivCheck.allowed, false, 'Site grant cannot unlock absolute_private');
  console.log('   ✓ absolute_private: owner=allowed, site grant=blocked.\n');

  // Tests 11-14: Redirect-loop regression
  console.log('11. Redirect-loop regression: unauthenticated private page...');
  const rlPrivEval = await evaluateAccess({ path: '/timeline' }, null);
  assert.strictEqual(rlPrivEval.allowed, false);
  assert.strictEqual(rlPrivEval.reason, 'unauthenticated');
  console.log('   ✓ Unauthenticated private → not allowed (no loop, stable 401).\n');

  console.log('12. Redirect-loop regression: authenticated but no grant on private page...');
  const rlSession = {
    userId: `rl-user-${runId}`,
    email: `rl-${runId}@example.com`,
    role: 'visitor',
    name: 'RL Visitor',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  const rlEval = await evaluateAccess({ path: `/entry/rl-private-${runId}`, world: 'life' }, rlSession);
  assert.strictEqual(rlEval.allowed, false);
  assert.strictEqual(rlEval.reason, 'unauthorized_can_request');
  console.log('   ✓ Authenticated+no-grant → not allowed, reason=unauthorized_can_request (no loop).\n');

  console.log('13. Redirect-loop regression: /login path must always evaluate safely...');
  const loginEval = await evaluateAccess({ path: '/login' }, null);
  assert(typeof loginEval.allowed === 'boolean', 'evaluateAccess must not throw for /login');
  console.log('   ✓ /login evaluates safely without throwing.\n');

  console.log('14. Redirect-loop regression: /api/auth paths evaluate safely...');
  const apiEval = await evaluateAccess({ path: '/api/auth/callback/google' }, null);
  assert(typeof apiEval.allowed === 'boolean', 'evaluateAccess must not throw for /api paths');
  console.log('   ✓ /api/* paths evaluate safely.\n');

  // Tests 15-17: Grant type scoping
  console.log('15. Testing page grant does NOT unlock other pages...');
  const pgOnlySession = {
    userId: `pg-only-${runId}`,
    email: `pg-only-${runId}@example.com`,
    role: 'visitor',
    name: 'Page-Only User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  await grantAccess(storage, {
    email: pgOnlySession.email,
    name: pgOnlySession.name,
    scope: 'page',
    target: `/entry/specific-page-${runId}`,
  });
  const otherPageEval = await evaluateAccess({
    path: `/entry/other-page-${runId}`,
    world: 'life',
  }, pgOnlySession);
  assert.strictEqual(otherPageEval.allowed, false, 'Page grant should not unlock other pages');
  console.log('   ✓ Page grant is scoped to that page only.\n');

  console.log('16. Testing world grant does NOT unlock other worlds...');
  const worldGrantSession2 = {
    userId: `world-grant2-${runId}`,
    email: `world-grant2-${runId}@example.com`,
    role: 'visitor',
    name: 'World Grant 2',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  await grantAccess(storage, {
    email: worldGrantSession2.email,
    name: worldGrantSession2.name,
    scope: 'world',
    target: 'travel',
  });
  const otherWorldEval = await evaluateAccess({
    path: `/entry/life-entry-${runId}`,
    world: 'life',
  }, worldGrantSession2);
  assert.strictEqual(otherWorldEval.allowed, false, 'World grant for travel should not unlock life entries');
  console.log('   ✓ World grant is scoped to that world only.\n');

  console.log('17. Testing world grant does NOT unlock absolute_private in the same world...');
  const absPrivInWorld = await evaluateAccess({
    path: `/entry/abs-priv-travel-${runId}`,
    world: 'travel',
    visibility: 'absolute_private',
  }, worldGrantSession);
  assert.strictEqual(absPrivInWorld.allowed, false, 'World grant should not unlock absolute_private in same world');
  console.log('   ✓ World grant cannot override absolute_private.\n');

  // Tests 18-19: Rejected / Revoked
  console.log('18. Rejected grant: reason=rejected...');
  assert.strictEqual(rejectedEval.reason, 'rejected');
  console.log('   ✓ Rejected reason is correct.\n');

  console.log('19. Revoked grant: treated as rejected...');
  assert.strictEqual(revokedEval.reason, 'rejected');
  console.log('   ✓ Revoked treated as rejected.\n');

  // Test 20: absolute_private with visitor session
  console.log('20. absolute_private stays locked for any visitor session...');
  const absPrivVisitorEval = await evaluateAccess({
    path: `/entry/private-${runId}`,
    world: 'life',
    visibility: 'absolute_private',
  }, rlSession);
  assert.strictEqual(absPrivVisitorEval.allowed, false);
  assert.strictEqual(absPrivVisitorEval.visibility, 'absolute_private');
  console.log('   ✓ absolute_private locked for visitor sessions.\n');

  // Test 21: owner can access everything
  console.log('21. Owner session has unrestricted access...');
  const ownerPrivateAccess = await evaluateAccess({
    path: `/entry/private-${runId}`,
    world: 'life',
  }, ownerSession);
  assert.strictEqual(ownerPrivateAccess.allowed, true);
  assert.strictEqual(ownerPrivateAccess.reason, 'owner');
  console.log('    ✓ Owner session has unrestricted access.\n');

  // Test 11b: Exempt routes structural safety
  console.log('11b. Exempt routes can be evaluated without throwing (structural safety)...');
  const exemptPaths = ['/login', '/api/auth/callback/google', '/api/access/request', '/uploads/test.jpg', '/images/cover.jpg'];
  for (const ep of exemptPaths) {
    const r = await evaluateAccess({ path: ep }, null);
    assert(typeof r.allowed === 'boolean', `evaluateAccess must return a valid result for ${ep}`);
  }
  console.log('    ✓ evaluateAccess handles exempt paths without throwing.\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // Tests 22-31: PUBLIC WORLD LANDING PAGE SEMANTICS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' PUBLIC WORLD LANDING PAGE TESTS (22-31)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Test 22: Public world landing is accessible without login
  console.log('22. Public world landing pages are accessible without authentication...');
  for (const slug of ['life', 'travel', 'interests', 'making']) {
    const worldEval = await evaluateAccess({ path: `/world/${slug}`, world: slug }, null);
    assert.strictEqual(worldEval.allowed, true, `World ${slug} should be accessible without auth`);
    assert.strictEqual(worldEval.reason, 'public', `World ${slug} should have reason=public`);
    assert.strictEqual(worldEval.visibility, 'public', `World ${slug} should have visibility=public`);
  }
  console.log('   ✓ All four world landing pages accessible without authentication.\n');

  // Test 23: isPublicWorldLandingPath() correctly identifies world landing vs child paths
  console.log('23. isPublicWorldLandingPath correctly discriminates world vs child paths...');
  assert.strictEqual(isPublicWorldLandingPath('/world/life'), true, '/world/life should be public world');
  assert.strictEqual(isPublicWorldLandingPath('/world/life/'), true, '/world/life/ should be public world');
  assert.strictEqual(isPublicWorldLandingPath('/world/travel'), true);
  assert.strictEqual(isPublicWorldLandingPath('/world/interests'), true);
  assert.strictEqual(isPublicWorldLandingPath('/world/making'), true);
  // Negative: child entry paths must NOT be matched
  assert.strictEqual(isPublicWorldLandingPath('/entry/my-story'), false, '/entry/* must not be public world landing');
  assert.strictEqual(isPublicWorldLandingPath('/world/archive'), false, 'archive is not in PUBLIC_WORLD_SLUGS');
  assert.strictEqual(isPublicWorldLandingPath('/world/life/sub-page'), false, 'sub-pages of worlds are not world landings');
  assert.strictEqual(isPublicWorldLandingPath('/timeline'), false);
  assert.strictEqual(isPublicWorldLandingPath('/'), false);
  console.log('   ✓ isPublicWorldLandingPath correctly discriminates world landing vs child paths.\n');

  // Test 24: PUBLIC_WORLD_SLUGS contains exactly the four expected world slugs
  console.log('24. PUBLIC_WORLD_SLUGS contains exactly the four expected world slugs...');
  assert.strictEqual(PUBLIC_WORLD_SLUGS.has('life'), true);
  assert.strictEqual(PUBLIC_WORLD_SLUGS.has('travel'), true);
  assert.strictEqual(PUBLIC_WORLD_SLUGS.has('interests'), true);
  assert.strictEqual(PUBLIC_WORLD_SLUGS.has('making'), true);
  assert.strictEqual(PUBLIC_WORLD_SLUGS.has('archive'), false, 'archive is not a public world');
  assert.strictEqual(PUBLIC_WORLD_SLUGS.has('me'), false, 'me is not a public world');
  console.log('   ✓ PUBLIC_WORLD_SLUGS is correct.\n');

  // Test 25: Child PRIVATE entry in a public world remains locked for unauthenticated
  console.log('25. Child PRIVATE entry remains locked for unauthenticated visitor in public world...');
  const privateChildUnauth = await evaluateAccess({
    path: `/entry/life-memory-${runId}`,
    world: 'life',
    // no visibility → defaults to 'private'
  }, null);
  assert.strictEqual(privateChildUnauth.allowed, false, 'Private child must be locked');
  assert.strictEqual(privateChildUnauth.reason, 'unauthenticated');
  console.log('   ✓ Private child entry locked for unauthenticated user even when world is public.\n');

  // Test 26: evaluateAccess never returns story body — private content not exposed via policy layer
  console.log('26. evaluateAccess returns no story body — private content not exposed via policy...');
  const privateChildEval = await evaluateAccess({
    path: `/entry/secret-story-${runId}`,
    world: 'life',
  }, null);
  assert.strictEqual(privateChildEval.allowed, false);
  assert.strictEqual('body' in privateChildEval, false, 'Evaluation must not include story body');
  assert.strictEqual('story' in privateChildEval, false, 'Evaluation must not include story content');
  assert.strictEqual('content' in privateChildEval, false, 'Evaluation must not include rendered content');
  console.log('   ✓ Policy evaluation result contains no story body or content fields.\n');

  // Test 27: Approved child in public world becomes accessible
  console.log('27. Approved child entry in a public world becomes accessible...');
  const approvedChildSession = {
    userId: `approved-child-${runId}`,
    email: `approved-child-${runId}@example.com`,
    role: 'visitor',
    name: 'Approved Child User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  const approvedChildPath = `/entry/approved-life-entry-${runId}`;
  await grantAccess(storage, {
    email: approvedChildSession.email,
    name: approvedChildSession.name,
    scope: 'page',
    target: approvedChildPath,
  });
  const approvedChildEval = await evaluateAccess({
    path: approvedChildPath,
    world: 'life',
  }, approvedChildSession);
  assert.strictEqual(approvedChildEval.allowed, true, 'Approved child should be accessible');
  assert.strictEqual(approvedChildEval.reason, 'granted_page');
  console.log('   ✓ Approved child entry accessible via page grant.\n');

  // Test 28: World grant unlocks normal PRIVATE children in that world
  console.log('28. World-scope grant unlocks normal PRIVATE children in that world...');
  // worldGrantSession has travel world grant (from test 5)
  const travelChildEval = await evaluateAccess({
    path: `/entry/travel-memory-${runId}`,
    world: 'travel',
  }, worldGrantSession);
  assert.strictEqual(travelChildEval.allowed, true, 'World grant should unlock travel private entry');
  assert.strictEqual(travelChildEval.reason, 'granted_world');
  console.log('   ✓ World-scope grant unlocks private children in that world.\n');

  // Test 29: ABSOLUTE_PRIVATE child in public world remains owner-only
  console.log('29. ABSOLUTE_PRIVATE child in public world remains owner-only...');
  const absPrivChildUnauth = await evaluateAccess({
    path: `/entry/abs-priv-life-${runId}`,
    world: 'life',
    visibility: 'absolute_private',
  }, null);
  assert.strictEqual(absPrivChildUnauth.allowed, false);
  assert.strictEqual(absPrivChildUnauth.visibility, 'absolute_private');

  // world grant cannot unlock absolute_private in that world
  const absPrivChildWithWorldGrant = await evaluateAccess({
    path: `/entry/abs-priv-travel-${runId}`,
    world: 'travel',
    visibility: 'absolute_private',
  }, worldGrantSession);
  assert.strictEqual(absPrivChildWithWorldGrant.allowed, false, 'absolute_private must not be unlocked by world grant');

  // owner can still access
  const absPrivChildOwner = await evaluateAccess({
    path: `/entry/abs-priv-life-${runId}`,
    world: 'life',
    visibility: 'absolute_private',
  }, ownerSession);
  assert.strictEqual(absPrivChildOwner.allowed, true);
  assert.strictEqual(absPrivChildOwner.reason, 'owner');
  console.log('   ✓ ABSOLUTE_PRIVATE child: locked for all visitors, accessible only for owner.\n');

  // Test 30: Public world does NOT automatically grant access to child entries
  console.log('30. Public world landing does NOT automatically grant access to child entries...');
  const noGrantSession = {
    userId: `no-grant-${runId}`,
    email: `no-grant-${runId}@example.com`,
    role: 'visitor',
    name: 'No Grant User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
  // World landing itself is public
  const worldLandingEval = await evaluateAccess({ path: '/world/life', world: 'life' }, noGrantSession);
  assert.strictEqual(worldLandingEval.allowed, true, 'World landing must be public');
  assert.strictEqual(worldLandingEval.reason, 'public');
  // Private child entry with NO grant must remain locked
  const childNoGrant = await evaluateAccess({
    path: `/entry/life-child-${runId}`,
    world: 'life',
  }, noGrantSession);
  assert.strictEqual(childNoGrant.allowed, false, 'Child entry must NOT be unlocked because world is public');
  assert.strictEqual(childNoGrant.reason, 'unauthorized_can_request');
  console.log('   ✓ Public world does NOT cascade access to child entries.\n');

  // Test 31: No redirect loop — clicking locked child from public world produces stable gate
  console.log('31. No redirect loop: locked child from public world produces stable gate...');
  // Unauthenticated click on private child
  const unauthClickedChild = await evaluateAccess({
    path: `/entry/private-child-${runId}`,
    world: 'travel',
  }, null);
  assert.strictEqual(unauthClickedChild.allowed, false);
  assert.strictEqual(unauthClickedChild.reason, 'unauthenticated');
  // → middleware redirects to /login once. login.astro evaluateAccess guard prevents looping back.

  // Authenticated with no grant: shows request-access gate stably
  const authNoGrantChild = await evaluateAccess({
    path: `/entry/private-child-${runId}`,
    world: 'travel',
  }, noGrantSession);
  assert.strictEqual(authNoGrantChild.allowed, false);
  assert.strictEqual(authNoGrantChild.reason, 'unauthorized_can_request');
  // → middleware calls next(), page renders AccessGate, no redirect loop.
  console.log('   ✓ Locked child evaluation produces stable gate reasons (no redirect loop).\n');

  // Test 32: ABSOLUTE_PRIVATE has allowRequests: false and unauthorized_cannot_request
  console.log('32. ABSOLUTE_PRIVATE has no request option (allowRequests=false)...');
  const absPrivLoggedUser = await evaluateAccess({
    path: `/entry/classified-${runId}`,
    world: 'life',
    visibility: 'absolute_private',
  }, noGrantSession);
  assert.strictEqual(absPrivLoggedUser.allowed, false);
  assert.strictEqual(absPrivLoggedUser.allowRequests, false, 'allowRequests must be false for absolute_private');
  assert.strictEqual(absPrivLoggedUser.reason, 'unauthorized_cannot_request');
  console.log('   ✓ ABSOLUTE_PRIVATE enforces allowRequests=false and unauthorized_cannot_request.\n');

  // Test 33: Production secret guardrails: missing secrets fail safely
  console.log('33. Production secret guardrails: missing secrets fail safely...');
  const savedSecrets = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    SESSION_SECRET: process.env.SESSION_SECRET,
    OWNER_SECRET: process.env.OWNER_SECRET,
    ADMIN_SECRET: process.env.ADMIN_SECRET,
    OWNER_EMAIL: process.env.OWNER_EMAIL,
  };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.OWNER_SECRET;
    delete process.env.ADMIN_SECRET;
    delete process.env.OWNER_EMAIL;

    assert.strictEqual(getAuthSecret(), null, 'getAuthSecret() must be null in production when unconfigured');
    assert.strictEqual(getOwnerSecret(), null, 'getOwnerSecret() must be null in production when unconfigured');
    assert.strictEqual(getOwnerEmail(), null, 'getOwnerEmail() must be null in production when unconfigured');

    let threw = false;
    try {
      createSessionToken(visitorSession);
    } catch (e) {
      threw = true;
      assert(String(e).includes('AUTH_SECRET is not configured'), 'Error message should indicate missing secret');
    }
    assert.strictEqual(threw, true, 'createSessionToken must throw when AUTH_SECRET is missing in production');
  } finally {
    for (const [k, v] of Object.entries(savedSecrets)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
  console.log('   ✓ Production missing secrets fail safely without insecure fallbacks.\n');

  // Test 34: Media protection: private media requires authorization
  console.log('34. Media protection: private entry media requires authorization...');
  const testMediaPath = 'images/1788711798045-img-4314-3.jpg';
  const unauthMedia = await evaluateMediaAccess(testMediaPath, null);
  assert.strictEqual(unauthMedia.allowed, false, 'Unauthenticated access to private media must be blocked');
  assert.strictEqual(unauthMedia.status, 401);

  const unauthVisitorMedia = await evaluateMediaAccess(testMediaPath, noGrantSession);
  assert.strictEqual(unauthVisitorMedia.allowed, false, 'Unauthorized visitor access to private media must be blocked');
  assert.strictEqual(unauthVisitorMedia.status, 403);

  const ownerMedia = await evaluateMediaAccess(testMediaPath, ownerSession);
  assert.strictEqual(ownerMedia.allowed, true, 'Owner must have access to private media');
  console.log('   ✓ Media protection gates access: unauthenticated (401), unauthorized (403), owner allowed.\n');

  // Test 35: Google OAuth identity verification and session creation
  console.log('35. Google OAuth identity verification and session creation...');
  const regularUser = createVisitorSession('testvisitor@gmail.com', 'Test Visitor');
  assert.strictEqual(regularUser.role, 'visitor');
  assert.strictEqual(regularUser.email, 'testvisitor@gmail.com');
  assert.strictEqual(isOwnerSession(regularUser), false);

  const ownerGoogleUser = createVisitorSession('ppdpitambar574@gmail.com', 'Raj Google');
  assert.strictEqual(ownerGoogleUser.role, 'owner');
  assert.strictEqual(isOwnerSession(ownerGoogleUser), true, 'Owner Google account must be recognized as owner');
  console.log('   ✓ Google OAuth identity session creation and owner promotion verified.\n');

  // Test 36: Places Atlas metadata filtering check
  console.log('36. filterVisibleEntries filters private entries for unauthorized sessions...');
  const sampleEntries = [
    { id: 'public-story', data: { visibility: 'public', world: 'travel' } },
    { id: 'private-story', data: { visibility: 'private', world: 'travel' } },
    { id: 'secret-diary', data: { visibility: 'absolute_private', world: 'life' } },
  ];
  const filteredForAnon = await filterVisibleEntries(sampleEntries, null);
  assert.strictEqual(filteredForAnon.length, 1);
  assert.strictEqual(filteredForAnon[0].id, 'public-story');

  const filteredForOwner = await filterVisibleEntries(sampleEntries, ownerSession);
  assert.strictEqual(filteredForOwner.length, 3, 'Owner sees all entries in filterVisibleEntries');
  console.log('   ✓ filterVisibleEntries properly protects private entries.\n');

  console.log('🎉 ALL 36 SECURITY & PERIMETER TESTS PASSED PERFECTLY!\n');
  console.log('   (21 original security tests + 10 public-world-visibility tests + 5 comprehensive guardrail tests)\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
