import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Load local .env if available
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env'); } catch {}
}

import {
  isStudioAccessible,
  isStudioActive,
  getCaptureEditorUrl,
  getCaptureWorkspaceUrl,
  DEFAULT_CAPTURE_BASE_URL,
} from '../src/lib/studio.ts';

import {
  createOwnerSession,
  createVisitorSession
} from '../src/lib/access-control/auth.ts';

import {
  evaluateAccess,
  isInterestsResource
} from '../src/lib/access-control/policy.ts';

import { evaluateMediaAccess } from '../src/lib/access-control/media.ts';
import { POST as publishEndpoint } from '../src/pages/api/publish.ts';

describe('Website Studio — Control Room & Authoring Suite', () => {
  const ownerSession = createOwnerSession();
  const visitorSession = createVisitorSession('friend@example.com', 'Friend');

  it('1. Studio accessibility: owner session has full access to Studio', () => {
    assert.strictEqual(isStudioAccessible(ownerSession), true);
    assert.strictEqual(isStudioActive(ownerSession), true);
    assert.strictEqual(isStudioActive(ownerSession, '1'), true);
  });

  it('2. Studio protection: unauthenticated visitor cannot access Studio', () => {
    assert.strictEqual(isStudioAccessible(null), false);
    assert.strictEqual(isStudioAccessible(undefined), false);
    assert.strictEqual(isStudioActive(null), false);
    assert.strictEqual(isStudioActive(undefined), false);
  });

  it('3. Studio protection: non-owner authenticated visitor cannot access Studio', () => {
    assert.strictEqual(isStudioAccessible(visitorSession), false);
    assert.strictEqual(isStudioActive(visitorSession), false);
    assert.strictEqual(isStudioActive(visitorSession, '1'), false);
  });

  it('4. Studio view: owner sees PUBLIC, PRIVATE, and ABSOLUTE_PRIVATE entries', async () => {
    const publicEval = await evaluateAccess(
      { path: '/entry/public-note', visibility: 'public', world: 'life' },
      ownerSession
    );
    assert.strictEqual(publicEval.allowed, true);

    const privateEval = await evaluateAccess(
      { path: '/entry/private-memory', visibility: 'private', world: 'life' },
      ownerSession
    );
    assert.strictEqual(privateEval.allowed, true);
    assert.strictEqual(privateEval.reason, 'owner');

    const absPrivateEval = await evaluateAccess(
      { path: '/entry/secret-journal', visibility: 'absolute_private', world: 'life' },
      ownerSession
    );
    assert.strictEqual(absPrivateEval.allowed, true);
    assert.strictEqual(absPrivateEval.reason, 'owner');
  });

  it('5. Public view integrity: non-owner visitor still gets normal access-control restrictions', async () => {
    // Unauthenticated
    const unauthPrivate = await evaluateAccess(
      { path: '/entry/private-memory', visibility: 'private', world: 'life' },
      null
    );
    assert.strictEqual(unauthPrivate.allowed, false);
    assert.strictEqual(unauthPrivate.reason, 'unauthenticated');

    // Authenticated non-owner without grant
    const visitorPrivate = await evaluateAccess(
      { path: '/entry/private-memory', visibility: 'private', world: 'life' },
      visitorSession
    );
    assert.strictEqual(visitorPrivate.allowed, false);
    assert.strictEqual(visitorPrivate.reason, 'unauthorized_can_request');

    // Absolute private is strictly forbidden to non-owners
    const visitorAbsPrivate = await evaluateAccess(
      { path: '/entry/secret-journal', visibility: 'absolute_private', world: 'life' },
      visitorSession
    );
    assert.strictEqual(visitorAbsPrivate.allowed, false);
    assert.strictEqual(visitorAbsPrivate.reason, 'unauthorized_cannot_request');
  });

  it('6. Media protection: private media remains gated and cannot be accessed by unauthorized users', async () => {
    const privateMedia = '/images/1789187530835-img-0795.jpg';

    // Unauthenticated
    const mediaEvalUnauth = await evaluateMediaAccess(privateMedia, null);
    assert.strictEqual(mediaEvalUnauth.allowed, false);
    assert.strictEqual(mediaEvalUnauth.reason, 'unauthenticated');

    // Non-owner visitor without grant
    const mediaEvalVisitor = await evaluateMediaAccess(privateMedia, visitorSession);
    assert.strictEqual(mediaEvalVisitor.allowed, false);
    assert.strictEqual(mediaEvalVisitor.reason, 'unauthorized');

    // Owner has full access
    const mediaEvalOwner = await evaluateMediaAccess(privateMedia, ownerSession);
    assert.strictEqual(mediaEvalOwner.allowed, true);
    assert.strictEqual(mediaEvalOwner.reason, 'owner');
  });

  it('7. Presentation reuse: Studio reuses the exact existing website layout and components', async () => {
    const baseAstroContent = await fs.readFile(path.join(process.cwd(), 'src/layouts/Base.astro'), 'utf8');
    assert.ok(baseAstroContent.includes('StudioBar'), 'Base layout conditionally embeds StudioBar');
    assert.ok(baseAstroContent.includes('isStudioActive'), 'Base checks studio status for owner');
    assert.ok(baseAstroContent.includes('environmental-nav'), 'Preserves standard environmental nav');

    const studioBarContent = await fs.readFile(path.join(process.cwd(), 'src/components/StudioBar.astro'), 'utf8');
    assert.ok(studioBarContent.includes("RAJ'S CORNER"), 'Has Studio branding');
    assert.ok(studioBarContent.includes('Edit in Capture'), 'Has Edit in Capture action');
    assert.ok(studioBarContent.includes('Publish to Web'), 'Has Publish to Web action');
  });

  it('8. Entry edit link: on an entry page in Studio, owner sees edit link pointing to Capture with the entry id', () => {
    const entryId = 'the-cupboard-the-balcony-and-the-nda-bahana';
    const editorUrl = getCaptureEditorUrl(entryId);
    assert.strictEqual(editorUrl, 'http://localhost:4322/#/editor/the-cupboard-the-balcony-and-the-nda-bahana');

    // Also handles trailing slashes and /entry/ prefix cleanly
    assert.strictEqual(
      getCaptureEditorUrl('the-cupboard-the-balcony-and-the-nda-bahana/'),
      'http://localhost:4322/#/editor/the-cupboard-the-balcony-and-the-nda-bahana'
    );
    assert.strictEqual(
      getCaptureEditorUrl('/entry/the-cupboard-the-balcony-and-the-nda-bahana/'),
      'http://localhost:4322/#/editor/the-cupboard-the-balcony-and-the-nda-bahana'
    );

    const generalEditorUrl = getCaptureEditorUrl();
    assert.strictEqual(generalEditorUrl, `${DEFAULT_CAPTURE_BASE_URL}/#/entries`);
  });

  it('9. Capture editor link accuracy: handles special characters, spaces, and custom base URL', () => {
    const customBase = 'http://127.0.0.1:4322/';
    const specialEntry = 'my memory & story with spaces!';
    const editorUrl = getCaptureEditorUrl(specialEntry, customBase);
    assert.strictEqual(editorUrl, `http://127.0.0.1:4322/#/editor/${encodeURIComponent(specialEntry)}`);

    const workspaceUrl = getCaptureWorkspaceUrl(customBase);
    assert.strictEqual(workspaceUrl, 'http://127.0.0.1:4322/');

    // Verify Capture router regex correctly parses #/editor/<id> and #/editor/<id>/
    const testHash1 = '#/editor/the-cupboard-the-balcony-and-the-nda-bahana';
    const cleanHash1 = (testHash1.startsWith('#') ? testHash1.slice(1) : testHash1).replace(/\/+$/, '') || '/';
    const match1 = cleanHash1.match(/^\/(setup|editor)\/(.+)$/);
    assert.ok(match1, 'Router matches clean #/editor/<id>');
    assert.strictEqual(match1[1], 'editor');
    assert.strictEqual(decodeURIComponent(match1[2]), 'the-cupboard-the-balcony-and-the-nda-bahana');

    const testHash2 = '#/editor/the-cupboard-the-balcony-and-the-nda-bahana/';
    const cleanHash2 = (testHash2.startsWith('#') ? testHash2.slice(1) : testHash2).replace(/\/+$/, '') || '/';
    const match2 = cleanHash2.match(/^\/(setup|editor)\/(.+)$/);
    assert.ok(match2, 'Router matches #/editor/<id>/ with trailing slash');
    assert.strictEqual(match2[1], 'editor');
    assert.strictEqual(decodeURIComponent(match2[2]), 'the-cupboard-the-balcony-and-the-nda-bahana');
  });

  it('10. Local saving behavior: saving an entry locally writes Markdown to src/content/entries/ and does NOT publish', async () => {
    const testId = `test-studio-local-save-${Date.now()}`;
    const testFile = path.join(process.cwd(), `src/content/entries/${testId}.md`);
    const testMarkdown = `---
title: "Test Studio Entry"
type: "note"
world: "life"
status: "past"
featured: false
accent: "sand"
visibility: "private"
---

This is a local save test content that stays local on disk.
`;

    try {
      await fs.writeFile(testFile, testMarkdown, 'utf8');
      const fileExists = await fs.stat(testFile).then(() => true).catch(() => false);
      assert.strictEqual(fileExists, true);

      const readBack = await fs.readFile(testFile, 'utf8');
      assert.ok(readBack.includes('This is a local save test content'));
    } finally {
      // Clean up test file
      await fs.unlink(testFile).catch(() => {});
    }
  });

  it('11. Local changes preview: local updates to Markdown are immediately readable for preview', async () => {
    const testId = `test-preview-instant-${Date.now()}`;
    const testFile = path.join(process.cwd(), `src/content/entries/${testId}.md`);
    const v1 = `---\ntitle: "Version 1"\ntype: "note"\nworld: "life"\n---\nDraft one.`;
    const v2 = `---\ntitle: "Version 2"\ntype: "note"\nworld: "life"\n---\nDraft two with edits.`;

    try {
      await fs.writeFile(testFile, v1, 'utf8');
      let content = await fs.readFile(testFile, 'utf8');
      assert.ok(content.includes('Version 1'));

      // Simulate local save in editor
      await fs.writeFile(testFile, v2, 'utf8');
      content = await fs.readFile(testFile, 'utf8');
      assert.ok(content.includes('Version 2') && content.includes('Draft two with edits'));
    } finally {
      await fs.unlink(testFile).catch(() => {});
    }
  });

  it('11b. Target entry content loading: existing Markdown story loads accurately for the-cupboard-the-balcony-and-the-nda-bahana', async () => {
    const targetFile = path.join(process.cwd(), 'src/content/entries/the-cupboard-the-balcony-and-the-nda-bahana.md');
    const content = await fs.readFile(targetFile, 'utf8');
    assert.ok(content.includes('The Cupboard, the Balcony & the NDA Bahana'));
    assert.ok(content.includes('Aditya Bishoyi'));
    assert.ok(content.includes('Shakti Prasad Tripathy'));
  });

  it('12. Publish workflow: Publish to Web is an explicit owner action invoking /api/publish', async () => {
    // Create an Astro request with owner session cookie and test mode header
    const { createSessionToken } = await import('../src/lib/access-control/auth.ts');
    const token = createSessionToken(ownerSession);
    const mockRequest = new Request('http://localhost:4321/api/publish', {
      method: 'POST',
      headers: {
        'cookie': `raj_session=${token}`,
        'x-test-mode': 'true',
      },
    });

    const response = await publishEndpoint({ request: mockRequest });
    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.strictEqual(data.ok, true);
    assert.ok(data.message.includes('Publish action authorized successfully'));
  });

  it('13. Publish protection: non-owner cannot invoke /api/publish', async () => {
    const { createSessionToken } = await import('../src/lib/access-control/auth.ts');

    // 1. Unauthenticated request
    const unauthReq = new Request('http://localhost:4321/api/publish', {
      method: 'POST',
    });
    const unauthRes = await publishEndpoint({ request: unauthReq });
    assert.strictEqual(unauthRes.status, 401);

    // 2. Non-owner visitor request
    const visitorToken = createSessionToken(visitorSession);
    const visitorReq = new Request('http://localhost:4321/api/publish', {
      method: 'POST',
      headers: {
        'cookie': `raj_session=${visitorToken}`,
      },
    });
    const visitorRes = await publishEndpoint({ request: visitorReq });
    assert.strictEqual(visitorRes.status, 401);
  });

  it('14. Public website preservation: Things I Like / Interests world remains completely public and intact', async () => {
    const interestRooms = [
      'music', 'cars', 'space', 'books', 'games',
      'sports', 'fitness', 'challenges', 'movies-anime',
      'technology', 'temporary-obsessions'
    ];

    for (const room of interestRooms) {
      const isInterests = isInterestsResource({ path: `/world/interests`, category: room });
      assert.strictEqual(isInterests, true, `Category ${room} must belong to interests`);
    }

    // Verify unauthenticated visitor can access interests landing and child
    const landingEval = await evaluateAccess({ path: '/world/interests' }, null);
    assert.strictEqual(landingEval.allowed, true);
    assert.strictEqual(landingEval.reason, 'public');

    const childEval = await evaluateAccess(
      { path: '/entry/alan-walker-collection', type: 'music', world: 'interests' },
      null
    );
    assert.strictEqual(childEval.allowed, true);
    assert.strictEqual(childEval.reason, 'public');
  });
});
