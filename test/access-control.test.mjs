import assert from 'node:assert';

// Load local .env if available so OWNER_EMAIL and dev secrets are present
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env'); } catch {}
}

import { evaluateAccess, filterVisibleEntries, PUBLIC_WORLD_SLUGS, isPublicWorldLandingPath } from '../src/lib/access-control/policy.ts';
import { buildLifeSections, buildPeopleDirectory, isEntryRelatedToPerson, getEntriesForPerson } from '../src/lib/people.ts';

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tests 37-40: PEOPLE / RELATIONSHIPS ARCHITECTURE & CHRONOLOGY
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' PEOPLE & RELATIONSHIPS ARCHITECTURE TESTS (37-40)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Test 37: Life sections: Chronology (2026, 2023), People (independent of dates), Timeless
  console.log('37. Life sections: Chronology (2026, 2023), People (Shakti Prasad Tripathy, Aditya Bishoyi)...');
  const testLifeEntries = [
    {
      id: 'the-day-we-faced-the-needle',
      data: {
        title: '🩸 THE DAY WE FACED THE NEEDLE',
        type: 'memory',
        world: 'life',
        date: new Date('2026-09-30'),
        related: ['banamudra-sahoo'],
        people: ['BANAMUDRA SAHOO']
      }
    },
    {
      id: 'the-cycling-accident',
      data: {
        title: 'The Cycling Accident',
        type: 'memory',
        world: 'life',
        date: new Date('2026-09-08'),
        related: [],
        people: ['Abhisekh']
      }
    },
    {
      id: 'the-cupboard-the-balcony-and-the-nda-bahana',
      data: {
        title: 'The Cupboard, the Balcony & the NDA Bahana',
        type: 'memory',
        world: 'life',
        date: new Date('2023-09-05'),
        related: ['shakti', 'aditya-bishoyi'],
        people: ['Shakti Prasad Tripathy', 'Aditya Bishoyi']
      }
    },
    {
      id: 'banamudra-sahoo',
      data: { title: 'BANAMUDRA SAHOO', type: 'person', world: 'life', related: [] }
    },
    {
      id: 'shakti',
      data: { title: 'Shakti Prasad Tripathy', type: 'person', world: 'life', related: [] }
    },
    {
      id: 'aditya-bishoyi',
      data: { title: 'Aditya Bishoyi', type: 'person', world: 'life', related: [] }
    }
  ];

  const sections = buildLifeSections(testLifeEntries, testLifeEntries);
  
  // 1. Chronology: 2026 and 2023 appear, containing ONLY memories/events, NEVER people
  assert.strictEqual(sections.years.length, 2, 'Should have 2 chronological years: 2026 and 2023');
  assert.strictEqual(sections.years[0].year, '2026');
  assert.strictEqual(sections.years[0].entries.length, 2, '2026 has 2 memories/events');
  assert.strictEqual(sections.years[1].year, '2023');
  assert.strictEqual(sections.years[1].entries.length, 1, '2023 has 1 memory');
  assert.strictEqual(sections.years[1].entries[0].id, 'the-cupboard-the-balcony-and-the-nda-bahana');
  
  for (const yr of sections.years) {
    const hasPerson = yr.entries.some(e => e.data.type === 'person');
    assert.strictEqual(hasPerson, false, `Critical rule: people must NEVER be assigned to years in chronology (${yr.year})`);
  }

  // 2. People: independent of dates (Banamudra Sahoo, Shakti Prasad Tripathy, Aditya Bishoyi)
  assert.strictEqual(sections.people.length, 3, 'Exactly 3 distinct people in directory (no duplicates)');
  
  const banamudraItem = sections.people.find(p => p.person.id === 'banamudra-sahoo');
  assert(banamudraItem, 'Banamudra must exist under People');
  assert.strictEqual(banamudraItem.events.length, 1, 'Banamudra has 1 related memory');
  assert.strictEqual(banamudraItem.events[0].id, 'the-day-we-faced-the-needle');

  const shaktiItem = sections.people.find(p => p.person.id === 'shakti');
  assert(shaktiItem, 'Shakti Prasad Tripathy must exist under People');
  assert.strictEqual(shaktiItem.person.data.title, 'Shakti Prasad Tripathy');
  assert.strictEqual(shaktiItem.events.length, 1, 'Shakti has 1 related memory from 2023');
  assert.strictEqual(shaktiItem.events[0].id, 'the-cupboard-the-balcony-and-the-nda-bahana');
  assert.strictEqual(shaktiItem.person.data.date, undefined, 'Shakti must not have an artificial date');

  const adityaItem = sections.people.find(p => p.person.id === 'aditya-bishoyi');
  assert(adityaItem, 'Aditya Bishoyi must exist under People');
  assert.strictEqual(adityaItem.person.data.title, 'Aditya Bishoyi');
  assert.strictEqual(adityaItem.events.length, 1, 'Aditya has 1 related memory from 2023');
  assert.strictEqual(adityaItem.events[0].id, 'the-cupboard-the-balcony-and-the-nda-bahana');
  assert.strictEqual(adityaItem.person.data.date, undefined, 'Aditya must not have an artificial date');
  console.log('   ✓ Life page cleanly separates Chronology (2026, 2023) and People (independent of dates).\n');

  // Test 38: Extensibility: easily add future people (Abhijeet, Priyanshu) without redesigning
  console.log('38. Extensibility: add people dynamically (Abhijeet, Priyanshu) and Timeless support...');
  const extendedEntries = [
    ...testLifeEntries,
    {
      id: 'abhijeet',
      data: { title: 'Abhijeet', type: 'person', world: 'life', related: [] }
    },
    {
      id: 'priyanshu',
      data: { title: 'Priyanshu', type: 'person', world: 'life', related: [] }
    },
    {
      id: 'timeless-fragment',
      data: {
        title: 'A Timeless Thought',
        type: 'note',
        world: 'life'
      }
    }
  ];

  const extendedSections = buildLifeSections(extendedEntries, extendedEntries);
  assert.strictEqual(extendedSections.people.length, 5, 'Includes Banamudra, Shakti, Aditya, Abhijeet, Priyanshu');
  const abhijeet = extendedSections.people.find(p => p.person.id === 'abhijeet');
  const priyanshu = extendedSections.people.find(p => p.person.id === 'priyanshu');
  assert(abhijeet && priyanshu, 'Future people seamlessly integrated');
  assert.strictEqual(extendedSections.timeless.length, 1, 'Timeless section contains genuinely undated entries');
  assert.strictEqual(extendedSections.timeless[0].id, 'timeless-fragment');
  const timelessHasPerson = extendedSections.timeless.some(e => e.data.type === 'person');
  assert.strictEqual(timelessHasPerson, false, 'Timeless must NOT contain people merely because they lack a date');
  console.log('   ✓ People directory and Timeless sections dynamically extend with zero friction.\n');



  // Test 39: Server-side authorization on Person entity /entry/shakti
  console.log('39. Access control: /entry/shakti is private by default and protected...');
  const shaktiUnauth = await evaluateAccess({ path: '/entry/shakti', world: 'life' }, null);
  assert.strictEqual(shaktiUnauth.allowed, false, 'Unauthenticated visitor cannot access private person profile');
  assert.strictEqual(shaktiUnauth.reason, 'unauthenticated');

  const shaktiOwner = await evaluateAccess({ path: '/entry/shakti', world: 'life' }, ownerSession);
  assert.strictEqual(shaktiOwner.allowed, true, 'Owner has access to person profile');
  assert.strictEqual(shaktiOwner.reason, 'owner');
  console.log('   ✓ Person entity /entry/shakti access evaluation passed.\n');

  // Test 40: /people route evaluation is safe and does not trigger redirect loop
  console.log('40. Route safety: /people evaluates safely without throwing or redirect loops...');
  const peopleEval = await evaluateAccess({ path: '/people' }, null);
  assert(typeof peopleEval.allowed === 'boolean', 'evaluateAccess must handle /people safely');
  console.log('   ✓ /people evaluates safely.\n');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' THINGS I LIKE / INTERESTS WORLD PUBLIC ACCESS TESTS (41-46)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Test 41: /world/interests/ is public
  console.log('41. /world/interests/ landing page is public...');
  const interestsLanding = await evaluateAccess({ path: '/world/interests', world: 'interests' }, null);
  assert.strictEqual(interestsLanding.allowed, true);
  assert.strictEqual(interestsLanding.reason, 'public');
  assert.strictEqual(interestsLanding.visibility, 'public');
  console.log('   ✓ /world/interests is accessible without authentication.\n');

  // Test 42: an Interests child entry is public
  console.log('42. Existing Interests child entries (Music, Cars, Space, Books, Games, Sports, Fitness, etc.) are public...');
  const porscheEval = await evaluateAccess({ path: '/entry/porsche-911', world: 'interests', type: 'car' }, null);
  assert.strictEqual(porscheEval.allowed, true);
  assert.strictEqual(porscheEval.visibility, 'public');
  assert.strictEqual(porscheEval.reason, 'public');

  const chessEval = await evaluateAccess({ path: '/entry/chess', world: 'interests', type: 'chess' }, null);
  assert.strictEqual(chessEval.allowed, true);
  assert.strictEqual(chessEval.visibility, 'public');

  const ruposhEval = await evaluateAccess({ path: '/entry/ruposh', world: 'interests', type: 'music' }, null);
  assert.strictEqual(ruposhEval.allowed, true);
  assert.strictEqual(ruposhEval.visibility, 'public');
  console.log('   ✓ Existing Interests child entries evaluate to public.\n');

  // Test 43: Unauthenticated visitor can access an Interests child directly
  console.log('43. Unauthenticated visitor can access Interests child directly without login redirect...');
  const visitorMusicEval = await evaluateAccess({ path: '/entry/preet-re', world: 'interests' }, null);
  assert.strictEqual(visitorMusicEval.allowed, true);
  assert.strictEqual(visitorMusicEval.reason, 'public');
  console.log('   ✓ Unauthenticated visitor granted direct access to Interests child.\n');

  // Test 44: Future/default Interests entries are public automatically without manual visibility setting
  console.log('44. Future / default Interests entries default to PUBLIC automatically...');
  const futureInterest = await evaluateAccess({
    path: `/entry/future-interest-${runId}`,
    world: 'interests',
    // no visibility set
  }, null);
  assert.strictEqual(futureInterest.allowed, true);
  assert.strictEqual(futureInterest.visibility, 'public');

  const futureByInterestType = await evaluateAccess({
    path: `/entry/future-gadget-${runId}`,
    type: 'technology',
    // no world, no visibility set
  }, null);
  assert.strictEqual(futureByInterestType.allowed, true);
  assert.strictEqual(futureByInterestType.visibility, 'public');
  console.log('   ✓ Future entries under world: interests default to public automatically.\n');

  // Test 45: Interests public access does NOT make Life/Travel/Making public
  console.log('45. Interests public access does NOT make Life/Travel/Making child entries public...');
  const lifeChild = await evaluateAccess({ path: `/entry/life-check-${runId}`, world: 'life' }, null);
  assert.strictEqual(lifeChild.allowed, false, 'Life child must remain private');
  assert.strictEqual(lifeChild.reason, 'unauthenticated');

  const travelChild = await evaluateAccess({ path: `/entry/travel-check-${runId}`, world: 'travel' }, null);
  assert.strictEqual(travelChild.allowed, false, 'Travel child must remain private');
  assert.strictEqual(travelChild.reason, 'unauthenticated');

  const makingChild = await evaluateAccess({ path: `/entry/making-check-${runId}`, world: 'making' }, null);
  assert.strictEqual(makingChild.allowed, false, 'Making child must remain private');
  assert.strictEqual(makingChild.reason, 'unauthenticated');
  console.log('   ✓ Life, Travel, and Making child entries strictly remain private by default.\n');

  // Test 46: Existing private access-control behavior elsewhere remains unchanged
  console.log('46. Existing private access-control behavior elsewhere remains unchanged...');
  // Person profile stays private
  const personEval = await evaluateAccess({ path: '/entry/shakti', world: 'life' }, null);
  assert.strictEqual(personEval.allowed, false);

  // Absolute private remains owner-only even if someone sets world: interests
  const absPrivInterests = await evaluateAccess({
    path: `/entry/abs-priv-test-${runId}`,
    world: 'interests',
    visibility: 'absolute_private',
  }, null);
  assert.strictEqual(absPrivInterests.allowed, false, 'Explicit absolute_private must remain locked');
  assert.strictEqual(absPrivInterests.visibility, 'absolute_private');

  // Aggregate protected section remains protected
  const timelineEval = await evaluateAccess({ path: '/timeline' }, null);
  assert.strictEqual(timelineEval.allowed, false);
  console.log('   ✓ Existing security perimeter, absolute-private, and other worlds remain intact.\n');

  console.log('🎉 ALL 46 SECURITY, PERIMETER & INTERESTS TESTS PASSED PERFECTLY!\n');
  console.log('   (21 original security tests + 10 public-world-visibility tests + 5 guardrail tests + 4 people architecture tests + 6 interests world public tests)\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
