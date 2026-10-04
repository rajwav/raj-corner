import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { UserSession, Visibility } from './types';
import { evaluateAccess, normalizePath } from './policy';

export interface MediaSecurityInfo {
  isProtected: boolean;
  publicEntryIds: string[];
  privateEntryIds: string[];
  entries: Array<{ id: string; visibility: Visibility; world?: string }>;
}

export function normalizeMediaPath(mediaUrl: string): string {
  if (!mediaUrl) return '';
  const clean = mediaUrl.split('?')[0].split('#')[0].trim();
  // Strip leading slash
  return clean.replace(/^\/+/, '');
}

/**
 * Extract all media URLs mentioned in a raw entry body and frontmatter.
 */
export function extractMediaUrlsFromEntry(entryData: any, body: string = ''): string[] {
  const urls = new Set<string>();

  if (entryData.cover && typeof entryData.cover === 'string') {
    urls.add(normalizeMediaPath(entryData.cover));
  }
  if (entryData.audio && typeof entryData.audio === 'string') {
    urls.add(normalizeMediaPath(entryData.audio));
  }

  // Markdown image syntax: ![alt](url)
  const mdImgRegex = /!\[.*?\]\(([^)\s"']+)(?:\s+["'][^"']*["'])?\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdImgRegex.exec(body)) !== null) {
    if (m[1].startsWith('/') || m[1].startsWith('uploads/') || m[1].startsWith('images/')) {
      urls.add(normalizeMediaPath(m[1]));
    }
  }

  // HTML <img src="..."> <video src="..."> <audio src="...">
  const htmlTagRegex = /<(?:img|video|audio|source)[^>]+src=["']([^"']+)["']/gi;
  while ((m = htmlTagRegex.exec(body)) !== null) {
    if (m[1].startsWith('/') || m[1].startsWith('uploads/') || m[1].startsWith('images/')) {
      urls.add(normalizeMediaPath(m[1]));
    }
  }

  // Photo stack data-photos attribute
  const photoStackRegex = /data-photos=["']([^"']+)["']/gi;
  while ((m = photoStackRegex.exec(body)) !== null) {
    try {
      const photos = JSON.parse(m[1].replace(/&quot;/g, '"'));
      if (Array.isArray(photos)) {
        photos.forEach((p: any) => {
          if (p.url) urls.add(normalizeMediaPath(p.url));
        });
      }
    } catch {}
  }

  return [...urls];
}

/**
 * Scan entries from disk or collection to map media file -> entry visibilities.
 */
export async function getMediaRegistry(): Promise<Map<string, MediaSecurityInfo>> {
  const registry = new Map<string, MediaSecurityInfo>();
  const entriesDir = path.join(process.cwd(), 'src/content/entries');

  let files: string[] = [];
  try {
    const list = await fs.readdir(entriesDir, { recursive: true });
    files = list.filter(f => f.endsWith('.md')).map(f => path.join(entriesDir, f));
  } catch {
    return registry;
  }

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
      if (!match) continue;

      const id = path.relative(entriesDir, file).replace(/\.md$/, '').split(path.sep).join('/');
      const frontmatter = match[1];
      const body = match[2] || '';

      // Existing entries are private unless their frontmatter explicitly says
      // public; media inherits that conservative default.
      let visibility: Visibility = 'private';
      const visMatch = frontmatter.match(/^visibility:\s*([^\s]+)/m);
      if (visMatch && (visMatch[1] === 'private' || visMatch[1] === 'absolute_private')) {
        visibility = visMatch[1] as Visibility;
      }

      let world = '';
      const worldMatch = frontmatter.match(/^world:\s*([^\s]+)/m);
      if (worldMatch) world = worldMatch[1];

      let cover = '';
      const coverMatch = frontmatter.match(/^cover:\s*["']?([^"'\n\r]+)["']?/m);
      if (coverMatch) cover = coverMatch[1];

      let audio = '';
      const audioMatch = frontmatter.match(/^audio:\s*["']?([^"'\n\r]+)["']?/m);
      if (audioMatch) audio = audioMatch[1];

      const mediaUrls = extractMediaUrlsFromEntry({ cover, audio }, body);

      for (const mUrl of mediaUrls) {
        if (!registry.has(mUrl)) {
          registry.set(mUrl, {
            isProtected: false,
            publicEntryIds: [],
            privateEntryIds: [],
            entries: [],
          });
        }
        const info = registry.get(mUrl)!;
        info.entries.push({ id, visibility, world });
        if (visibility === 'public') {
          info.publicEntryIds.push(id);
        } else {
          info.privateEntryIds.push(id);
        }
      }
    } catch (e) {
      // Continue on file read error
    }
  }

  // A file is only public when every entry that references it deliberately
  // marks it public. Shared media must never downgrade a private entry.
  for (const [, info] of registry) {
    if (info.privateEntryIds.length > 0) {
      info.isProtected = true;
    }
  }

  return registry;
}

/**
 * Evaluate whether the session has authorization to view this media file.
 */
export async function evaluateMediaAccess(
  mediaPath: string,
  session: UserSession | null | undefined
): Promise<{ allowed: boolean; status: number; reason?: string }> {
  const cleanPath = normalizeMediaPath(mediaPath);
  const registry = await getMediaRegistry();
  const info = registry.get(cleanPath);

  // Unregistered files are private too. This prevents a newly uploaded asset
  // from becoming public before it is attached to an entry.
  if (info && !info.isProtected) {
    return { allowed: true, status: 200, reason: 'public' };
  }

  if (!info) {
    return { allowed: false, status: session ? 403 : 401, reason: 'unregistered' };
  }

  // Protected media: check if user has access to ANY of the private entries referencing it
  for (const entryRef of info.entries) {
    if (entryRef.visibility !== 'public') {
      const evaluation = await evaluateAccess({
        path: `/entry/${entryRef.id}`,
        world: entryRef.world,
        visibility: entryRef.visibility,
      }, session);

      if (evaluation.allowed) {
        return { allowed: true, status: 200, reason: evaluation.reason };
      }
    }
  }

  if (!session) {
    return { allowed: false, status: 401, reason: 'unauthenticated' };
  }
  return { allowed: false, status: 403, reason: 'unauthorized' };
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
      return 'audio/mp4';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Handle streaming media with HTTP Range request support.
 */
export async function serveMediaFileResponse(
  filePath: string,
  req: Request
): Promise<Response> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    // If .mov was requested and .mp4 exists, fallback
    if (filePath.endsWith('.mov')) {
      const mp4Path = filePath.slice(0, -4) + '.mp4';
      try {
        stat = await fs.stat(mp4Path);
        filePath = mp4Path;
      } catch {
        return new Response('File not found', { status: 404 });
      }
    } else {
      return new Response('File not found', { status: 404 });
    }
  }

  const fileSize = stat.size;
  const mimeType = getMimeType(filePath);
  const rangeHeader = req.headers.get('range');

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || (parts[1] && (isNaN(end) || end < start))) {
      return new Response('Requested range not satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
          'Content-Type': 'text/plain',
        },
      });
    }

    const effectiveEnd = Math.min(end, fileSize - 1);
    const chunkLength = effectiveEnd - start + 1;

    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(chunkLength);
    await fileHandle.read(buffer, 0, chunkLength, start);
    await fileHandle.close();

    return new Response(buffer, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${effectiveEnd}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkLength),
        'Content-Type': mimeType,
        'Cache-Control': 'private, no-transform, max-age=3600',
      },
    });
  }

  // Full file response
  const buffer = await fs.readFile(filePath);
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-transform, max-age=3600',
    },
  });
}
