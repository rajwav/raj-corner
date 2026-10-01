import http from 'node:http';
import { promises as fs } from 'node:fs';
import nodeFs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const root = path.dirname(fileURLToPath(import.meta.url));
const entriesDir = path.join(root, 'src/content/entries');
const captureDir = path.join(root, 'capture');
const publicImages = path.join(root, 'public/images');
const publicUploads = path.join(root, 'public/uploads');
const trashDir = path.join(root, '.trash');
const currentlyFile = path.join(root, 'src/content/currently/now.md');
const lifeListFile = path.join(root, 'src/content/lifeLists/life-list.md');
const types = ['person','memory','travel','trip','photo','car','music','thought','idea','experiment','place','milestone','dream'];
const accents = { memory:'sand', travel:'coral', trip:'coral', photo:'sky', car:'sky', music:'lime', thought:'lime', idea:'lime', experiment:'sky', place:'coral', milestone:'sand', dream:'night' };

const json = (res, status, value) => { res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control': 'no-cache, no-store, must-revalidate' }); res.end(JSON.stringify(value)); };
const text = (res, status, value, type='text/html; charset=utf-8') => { res.writeHead(status, { 'content-type':type, 'cache-control': 'no-cache, no-store, must-revalidate' }); res.end(value); };
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'untitled';
const safeName = (value) => value.replace(/[^a-zA-Z0-9._-]/g,'-');
const escapeYaml = (value='') => JSON.stringify(String(value));
const list = (value) => JSON.stringify(Array.isArray(value) ? value.filter(Boolean) : []);

const mediaTypes = {
  image: new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  audio: new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']),
  video: new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'])
};
const extensionByMime = { 'image/jpeg':'jpg', 'image/png':'png', 'image/gif':'gif', 'image/webp':'webp', 'audio/mpeg':'mp3', 'audio/mp4':'m4a', 'audio/ogg':'ogg', 'audio/wav':'wav', 'audio/webm':'webm', 'video/mp4':'mp4', 'video/webm':'webm', 'video/ogg':'ogv', 'video/quicktime':'mov' };
const mimeByExtension = Object.fromEntries(Object.entries(extensionByMime).map(([mime, ext]) => [ext, mime]));

async function body(req, limit = 500 * 1024 * 1024) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw Object.assign(new Error('Upload is too large (maximum 500 MB).'), { status: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}
function decodeUpload(data) {
  const hit = String(data.dataUrl || '').match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!hit) throw Object.assign(new Error('Choose a valid local media file.'), { status: 400 });
  const mime = hit[1].toLowerCase();
  const kind = Object.entries(mediaTypes).find(([, allowed]) => allowed.has(mime))?.[0];
  if (!kind || (data.type && data.type.toLowerCase() !== mime)) throw Object.assign(new Error('Only supported image, audio, or video formats can be uploaded.'), { status: 415 });
  const bytes = Buffer.from(hit[2], 'base64');
  if (!bytes.length || bytes.length > 500 * 1024 * 1024) throw Object.assign(new Error('Upload is too large (maximum 500 MB).'), { status: 413 });
  return { bytes, kind, ext: extensionByMime[mime] };
}
async function walk(dir) { const files = await fs.readdir(dir, { withFileTypes:true }); return (await Promise.all(files.map(file => file.isDirectory() ? walk(path.join(dir,file.name)) : [path.join(dir,file.name)]))).flat(); }
function parseArray(value='') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return value.replace(/^\[|\]$/g,'').split(',').map(x=>x.trim()).filter(Boolean); } }
function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/); if (!match) return { data:{}, body:raw };
  const data = {}; for (const line of match[1].split('\n')) { const hit=line.match(/^([\w-]+):\s*(.*)$/); if (!hit) continue; let [,key,value]=hit; value=value.trim(); if (value.startsWith('"')) { try { value=JSON.parse(value); } catch {} } else if (value.startsWith('[')) value=parseArray(value); else if (value.startsWith('{')) { try { value=JSON.parse(value); } catch {} } else if (value === 'true' || value === 'false') value=value === 'true'; data[key]=value; }
  return { data, body:match[2].trim() };
}
function markdown(data) {
  const front = [
    `title: ${escapeYaml(data.title)}`, `type: ${data.type}`, data.world ? `world: ${data.world}` : '', data.date ? `date: ${data.date}` : '', data.location ? `location: ${escapeYaml(data.location)}` : '',
    `tags: ${list(data.tags)}`, `description: ${escapeYaml(data.description || data.story?.split('\n')[0] || data.title)}`,
    `related: ${list(data.related)}`, data.people?.length ? `people: ${list(data.people)}` : '', data.cover ? `cover: ${escapeYaml(data.cover)}` : '',
    `status: ${data.status || 'past'}`, `featured: ${Boolean(data.featured)}`, `accent: ${accents[data.type] || 'sand'}`,
    data.presentation && Object.keys(data.presentation).length > 0 ? `presentation: ${JSON.stringify(data.presentation)}` : ''
  ].filter(Boolean).join('\n');
  const image = '';
  return `---\n${front}\n---\n\n${data.story?.trim() || ''}${image}\n`;
}
async function entryFiles() { try { return (await walk(entriesDir)).filter(file=>file.endsWith('.md')); } catch { return []; } }
async function readEntries(full=false) { const files=await entryFiles(); return Promise.all(files.map(async file=>{const parsed=parseFrontmatter(await fs.readFile(file,'utf8')); const id=path.relative(entriesDir,file).replace(/\.md$/,'').split(path.sep).join('/'); return full?{id,file,data:parsed.data,story:parsed.body}:{id,...parsed.data};})); }
async function uniqueFile(id, existingId) { const target=path.join(entriesDir, `${id}.md`); if (existingId === id) return target; try { await fs.access(target); return uniqueFile(`${id}-${Math.random().toString(36).slice(2,6)}`, existingId); } catch { return target; } }
async function readSimple(file) { try { return parseFrontmatter(await fs.readFile(file,'utf8')).data; } catch { return {}; } }
async function writeSimple(file, data, body='') { await fs.mkdir(path.dirname(file),{recursive:true}); const lines=Object.entries(data).map(([key,value])=>`${key}: ${Array.isArray(value)?list(value):escapeYaml(value)}`); await fs.writeFile(file,`---\n${lines.join('\n')}\n---\n\n${body}\n`); }


async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return {}; } }
async function writeJson(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(data, null, 2)); }
const rhythmHabitsFile = path.join(root, 'src/content/rhythm/habits.json');
const rhythmRecordsFile = path.join(root, 'src/content/rhythm/records.json');

async function serveMediaFile(req, res, filePath, contentType) {
  try {
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      // If .mov requested and .mp4 exists, fallback to .mp4
      if (filePath.endsWith('.mov')) {
        const mp4Path = filePath.slice(0, -4) + '.mp4';
        try {
          stat = await fs.stat(mp4Path);
          filePath = mp4Path;
          contentType = 'video/mp4';
        } catch {
          return text(res, 404, 'File not found', 'text/plain');
        }
      } else {
        return text(res, 404, 'File not found', 'text/plain');
      }
    }

    const fileSize = stat.size;
    const range = req.headers.range;

    // Handle HEAD request
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'content-type': contentType,
        'content-length': fileSize,
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=86400',
      });
      return res.end();
    }

    // Handle HTTP Range request (206 Partial Content)
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || (parts[1] && (isNaN(end) || end < start))) {
        res.writeHead(416, {
          'content-range': `bytes */${fileSize}`,
          'content-type': 'text/plain',
        });
        return res.end('Requested range not satisfiable');
      }

      const effectiveEnd = Math.min(end, fileSize - 1);
      const chunkSize = (effectiveEnd - start) + 1;
      const stream = nodeFs.createReadStream(filePath, { start, end: effectiveEnd });

      res.writeHead(206, {
        'content-range': `bytes ${start}-${effectiveEnd}/${fileSize}`,
        'accept-ranges': 'bytes',
        'content-length': chunkSize,
        'content-type': contentType,
        'cache-control': 'public, max-age=86400',
      });

      stream.pipe(res);
      stream.on('error', () => {
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      });
    } else {
      res.writeHead(200, {
        'content-length': fileSize,
        'content-type': contentType,
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=86400',
      });

      const stream = nodeFs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('error', () => {
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      });
    }
  } catch (err) {
    console.error('serveMediaFile error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal server error');
    }
  }
}

const server=http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url, 'http://localhost');
    if (req.method==='GET' && url.pathname==='/') return text(res,200,await fs.readFile(path.join(captureDir,'index.html'),'utf8'));
    if (req.method==='GET' && url.pathname==='/app.js') return text(res,200,await fs.readFile(path.join(captureDir,'app.js'),'utf8'),'text/javascript; charset=utf-8');
    if (req.method==='GET' && url.pathname==='/blocknote-poc.js') return text(res,200,await fs.readFile(path.join(captureDir,'blocknote-poc.js'),'utf8'),'text/javascript; charset=utf-8');
    if (req.method==='GET' && url.pathname==='/blocknote-poc.css') return text(res,200,await fs.readFile(path.join(captureDir,'blocknote-poc.css'),'utf8'),'text/css; charset=utf-8');
    if (req.method==='GET' && url.pathname==='/style.css') return text(res,200,await fs.readFile(path.join(captureDir,'style.css'),'utf8'),'text/css; charset=utf-8');
    if (req.method==='GET' && url.pathname==='/global.css') return text(res,200,await fs.readFile(path.join(root,'src/styles/global.css'),'utf8'),'text/css; charset=utf-8');
    if (req.method==='GET' && url.pathname==='/lib/entryTemplate.js') return text(res,200,await fs.readFile(path.join(root,'src/lib/entryTemplate.js'),'utf8'),'text/javascript; charset=utf-8');
    if (req.method==='GET' && url.pathname==='/lib/photoStack.js') return text(res,200,await fs.readFile(path.join(root,'src/lib/photoStack.js'),'utf8'),'text/javascript; charset=utf-8');
    if ((req.method==='GET' || req.method==='HEAD') && (url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/images/'))) {
      const name = path.basename(decodeURIComponent(url.pathname));
      const directory = url.pathname.startsWith('/uploads/') ? publicUploads : publicImages;
      const file = path.join(directory, name);
      const ext = path.extname(name).slice(1).toLowerCase();
      return serveMediaFile(req, res, file, mimeByExtension[ext] || 'application/octet-stream');
    }
    if (req.method==='GET' && url.pathname==='/api/entries') return json(res,200,await readEntries());
    if (req.method==='GET' && url.pathname.startsWith('/api/entry/')) { const id=decodeURIComponent(url.pathname.slice(11)); const found=(await readEntries(true)).find(entry=>entry.id===id); return found?json(res,200,found):json(res,404,{error:'Entry not found'}); }
    if (req.method==='POST' && url.pathname==='/api/entry') { const data=await body(req); if (!types.includes(data.type)||!data.title?.trim()) return json(res,400,{error:'Choose a type and give it a title.'}); const id=data.existingId || slugify(data.title); const file=await uniqueFile(id,data.existingId); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,markdown(data)); return json(res,200,{ok:true,id:path.relative(entriesDir,file).replace(/\.md$/,'').split(path.sep).join('/')}); }
    if (req.method==='DELETE' && url.pathname.startsWith('/api/entry/')) { const data=await body(req); if (data.confirm!==true) return json(res,400,{error:'Deletion must be confirmed.'}); const id=decodeURIComponent(url.pathname.slice(11)); const file=path.resolve(entriesDir,`${id}.md`); if (!file.startsWith(entriesDir+path.sep)) return json(res,400,{error:'Invalid entry'}); await fs.mkdir(trashDir,{recursive:true}); await fs.rename(file,path.join(trashDir,`${Date.now()}-${safeName(id)}.md`)); return json(res,200,{ok:true}); }
    if (req.method==='POST' && url.pathname==='/api/publish') {
      try {
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);
        await execAsync('git add .', { cwd: root });
        const { stdout: status } = await execAsync('git status --porcelain', { cwd: root });
        if (!status.trim()) {
          return json(res, 200, { ok: true, message: 'All changes are already published to GitHub!' });
        }
        await execAsync('git commit -m "Update content via Capture"', { cwd: root });
        await execAsync('git push origin main', { cwd: root });
        return json(res, 200, { ok: true, message: 'Published! Pushed to GitHub and Vercel is updating now.' });
      } catch (err) {
        console.error('Publish error:', err);
        return json(res, 500, { error: err.message || 'Failed to publish to GitHub' });
      }
    }
    if (req.method==='POST' && url.pathname==='/api/image') {
      const data = await body(req);
      const upload = decodeUpload({ ...data, type: data.type || String(data.dataUrl || '').match(/^data:([^;]+)/)?.[1] });
      if (upload.kind !== 'image') return json(res,415,{error:'Cover uploads must be images.'});
      const name = `${Date.now()}-${safeName(slugify((data.name||'image').replace(/\.[^.]+$/,'')))}.${upload.ext}`;
      await fs.mkdir(publicImages,{recursive:true});
      await fs.writeFile(path.join(publicImages,name),upload.bytes);
      return json(res,200,{url:`/images/${name}`});
    }
    if (req.method==='POST' && url.pathname==='/api/upload-raw') {
      const origName = decodeURIComponent(url.searchParams.get('name') || 'upload');
      const rawExt = path.extname(origName).slice(1).toLowerCase();
      const ext = rawExt || (req.headers['content-type'] ? extensionByMime[req.headers['content-type'].toLowerCase()] : '') || 'bin';
      const kind = Object.entries(mediaTypes).find(([, set]) => set.has(req.headers['content-type']?.toLowerCase()))?.[0] || (['mp4','mov','webm','ogg'].includes(ext) ? 'video' : 'media');
      let name = `${Date.now()}-${safeName(slugify(origName.replace(/\.[^.]+$/, '')))}.${ext}`;
      const filePath = path.join(publicUploads, name);
      await fs.mkdir(publicUploads, { recursive: true });

      const writeStream = nodeFs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
        req.pipe(writeStream);
        req.on('error', reject);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      if ((kind === 'video' || ext === 'mov') && ext !== 'mp4') {
        const mp4Name = `${Date.now()}-${safeName(slugify(origName.replace(/\.[^.]+$/, '')))}.mp4`;
        const mp4Path = path.join(publicUploads, mp4Name);
        try {
          await execFileAsync('avconvert', ['-s', filePath, '-p', 'Preset1280x720', '-o', mp4Path, '--replace']);
          name = mp4Name;
        } catch (convErr) {
          console.warn('avconvert transcode warning:', convErr.message);
        }
      }

      return json(res, 200, { ok: true, url: `/uploads/${name}`, kind });
    }
    if (req.method==='POST' && url.pathname==='/api/upload') {
      const data = await body(req);
      const upload = decodeUpload(data);
      let ext = upload.ext;
      let name = `${Date.now()}-${safeName(slugify((data.name||upload.kind).replace(/\.[^.]+$/,'')))}.${ext}`;
      const filePath = path.join(publicUploads, name);
      await fs.mkdir(publicUploads, { recursive: true });
      await fs.writeFile(filePath, upload.bytes);

      if (upload.kind === 'video' && ext !== 'mp4') {
        const mp4Name = `${Date.now()}-${safeName(slugify((data.name||'video').replace(/\.[^.]+$/,'')))}.mp4`;
        const mp4Path = path.join(publicUploads, mp4Name);
        try {
          await execFileAsync('avconvert', ['-s', filePath, '-p', 'Preset1280x720', '-o', mp4Path, '--replace']);
          name = mp4Name;
        } catch (convErr) {
          console.warn('avconvert transcode warning:', convErr.message);
        }
      }

      return json(res, 200, { ok: true, url: `/uploads/${name}`, kind: upload.kind });
    }
    
    if (req.method==='GET' && url.pathname==='/api/rhythm-presets') {
      const presets = [
        { category: "BODY", habits: [ { id: "run", name: "Running", mode: "NUMBER" }, { id: "walk", name: "Walking", mode: "NUMBER" }, { id: "gym", name: "Gym", mode: "CHECKBOX" }, { id: "stretch", name: "Stretching", mode: "CHECKBOX" }, { id: "sports", name: "Sports", mode: "CHECKBOX" } ] },
        { category: "HEALTH", habits: [ { id: "sleep-7", name: "Sleep 7+ hours", mode: "TIME_TARGET" }, { id: "wake-early", name: "Wake up early", mode: "CHECKBOX" }, { id: "water", name: "Drink enough water", mode: "CHECKBOX" }, { id: "no-junk", name: "No junk food", mode: "CHECKBOX" } ] },
        { category: "MIND", habits: [ { id: "meditation", name: "Meditation", mode: "CHECKBOX" }, { id: "reading", name: "Reading", mode: "DURATION" }, { id: "journaling", name: "Journaling", mode: "CHECKBOX" }, { id: "no-social", name: "No social media", mode: "CHECKBOX" } ] },
        { category: "LEARNING", habits: [ { id: "study", name: "Study", mode: "DURATION" }, { id: "dsa", name: "DSA", mode: "CHECKBOX" }, { id: "python", name: "Python", mode: "CHECKBOX" }, { id: "ai-ml", name: "AI / ML", mode: "CHECKBOX" }, { id: "college-work", name: "College work", mode: "CHECKBOX" } ] },
        { category: "CREATION", habits: [ { id: "build", name: "Build", mode: "CHECKBOX" }, { id: "code", name: "Code", mode: "DURATION" }, { id: "project-work", name: "Project work", mode: "DURATION" }, { id: "side-project", name: "Side project", mode: "CHECKBOX" } ] },
        { category: "LIFE", habits: [ { id: "piano", name: "Piano", mode: "CHECKBOX" }, { id: "chess", name: "Chess", mode: "NUMBER" }, { id: "friends", name: "Time with friends", mode: "CHECKBOX" } ] },
        { category: "PERSONAL", habits: [ { id: "x-01", name: "X-01", mode: "NUMBER" } ] }
      ];
      return json(res, 200, presets);
    }
    
    if (req.method==='GET' && url.pathname==='/api/rhythm-habits') {
      const data = await readJson(rhythmHabitsFile);
      return json(res, 200, { habits: data.habits || [] });
    }
    
    if (req.method==='PUT' && url.pathname==='/api/rhythm-habits') {
      const data = await body(req);
      await writeJson(rhythmHabitsFile, { updated: new Date().toISOString().slice(0,10), habits: data.habits || [] });
      return json(res, 200, { ok: true });
    }

    if (req.method==='GET' && url.pathname==='/api/rhythm-records') {
      const data = await readJson(rhythmRecordsFile);
      return json(res, 200, { records: data.records || {} });
    }

    if (req.method==='PUT' && url.pathname==='/api/rhythm-records') {
      const data = await body(req);
      await writeJson(rhythmRecordsFile, { updated: new Date().toISOString().slice(0,10), records: data.records || {} });
      return json(res, 200, { ok: true });
    }

    if (req.method==='GET' && url.pathname==='/api/currently') return json(res,200,await readSimple(currentlyFile));
    if (req.method==='PUT' && url.pathname==='/api/currently') { const data=await body(req); await writeSimple(currentlyFile,{...data,updated:new Date().toISOString().slice(0,10)}); return json(res,200,{ok:true}); }
    if (req.method==='GET' && url.pathname==='/api/life-list') { const raw=await fs.readFile(lifeListFile,'utf8'); const parsed=parseFrontmatter(raw).data; if (!Array.isArray(parsed.done)) { const section=(name)=>{const match=raw.match(new RegExp(`${name}:\\n((?:\\s+- .+\\n?)*)`)); return match?[...match[1].matchAll(/- (.+)/g)].map(x=>x[1]):[]}; parsed.done=section('done');parsed.next=section('next');parsed.someday=section('someday'); } return json(res,200,parsed); }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const proxyReq = http.request({
        hostname: 'localhost',
        port: 4321,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: 'localhost:4321' }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => {
        text(res, 404, 'Not found', 'text/plain');
      });
      req.pipe(proxyReq);
      return;
    }
    return text(res,404,'Not found','text/plain');
  } catch (error) { console.error(error); return json(res,error.status || 500,{error:error.message||'Something went wrong'}); }
});
server.listen(4322,'127.0.0.1',()=>console.log('Raj’s Corner Capture is ready at http://127.0.0.1:4322'));
