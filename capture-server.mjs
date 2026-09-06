import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const entriesDir = path.join(root, 'src/content/entries');
const captureDir = path.join(root, 'capture');
const publicImages = path.join(root, 'public/images');
const trashDir = path.join(root, '.trash');
const currentlyFile = path.join(root, 'src/content/currently/now.md');
const lifeListFile = path.join(root, 'src/content/lifeLists/life-list.md');
const types = ['memory','travel','photo','car','music','thought','idea','experiment','place','milestone','dream'];
const accents = { memory:'sand', travel:'coral', photo:'sky', car:'sky', music:'lime', thought:'lime', idea:'lime', experiment:'sky', place:'coral', milestone:'sand', dream:'night' };

const json = (res, status, value) => { res.writeHead(status, { 'content-type':'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const text = (res, status, value, type='text/html; charset=utf-8') => { res.writeHead(status, { 'content-type':type }); res.end(value); };
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'untitled';
const safeName = (value) => value.replace(/[^a-zA-Z0-9._-]/g,'-');
const escapeYaml = (value='') => JSON.stringify(String(value));
const list = (value) => JSON.stringify(Array.isArray(value) ? value.filter(Boolean) : []);

async function body(req) { let raw=''; for await (const chunk of req) raw += chunk; return raw ? JSON.parse(raw) : {}; }
async function walk(dir) { const files = await fs.readdir(dir, { withFileTypes:true }); return (await Promise.all(files.map(file => file.isDirectory() ? walk(path.join(dir,file.name)) : [path.join(dir,file.name)]))).flat(); }
function parseArray(value='') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return value.replace(/^\[|\]$/g,'').split(',').map(x=>x.trim()).filter(Boolean); } }
function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/); if (!match) return { data:{}, body:raw };
  const data = {}; for (const line of match[1].split('\n')) { const hit=line.match(/^([\w-]+):\s*(.*)$/); if (!hit) continue; let [,key,value]=hit; value=value.trim(); if (value.startsWith('"')) { try { value=JSON.parse(value); } catch {} } else if (value.startsWith('[')) value=parseArray(value); else if (value === 'true' || value === 'false') value=value === 'true'; data[key]=value; }
  return { data, body:match[2].trim() };
}
function markdown(data) {
  const front = [
    `title: ${escapeYaml(data.title)}`, `type: ${data.type}`, data.date ? `date: ${data.date}` : '', data.location ? `location: ${escapeYaml(data.location)}` : '',
    `tags: ${list(data.tags)}`, `description: ${escapeYaml(data.description || data.story?.split('\n')[0] || data.title)}`,
    `related: ${list(data.related)}`, data.people?.length ? `people: ${list(data.people)}` : '', data.cover ? `cover: ${escapeYaml(data.cover)}` : '',
    `status: ${data.status || 'past'}`, `featured: ${Boolean(data.featured)}`, `accent: ${accents[data.type] || 'sand'}`
  ].filter(Boolean).join('\n');
  const image = data.cover ? `\n\n![${data.title}](${data.cover})` : '';
  return `---\n${front}\n---\n\n${data.story?.trim() || ''}${image}\n`;
}
async function entryFiles() { try { return (await walk(entriesDir)).filter(file=>file.endsWith('.md')); } catch { return []; } }
async function readEntries(full=false) { const files=await entryFiles(); return Promise.all(files.map(async file=>{const parsed=parseFrontmatter(await fs.readFile(file,'utf8')); const id=path.relative(entriesDir,file).replace(/\.md$/,'').split(path.sep).join('/'); return full?{id,file,data:parsed.data,story:parsed.body}:{id,...parsed.data};})); }
async function uniqueFile(id, existingId) { const target=path.join(entriesDir, `${id}.md`); if (existingId === id) return target; try { await fs.access(target); return uniqueFile(`${id}-${Math.random().toString(36).slice(2,6)}`, existingId); } catch { return target; } }
async function readSimple(file) { try { return parseFrontmatter(await fs.readFile(file,'utf8')).data; } catch { return {}; } }
async function writeSimple(file, data, body='') { await fs.mkdir(path.dirname(file),{recursive:true}); const lines=Object.entries(data).map(([key,value])=>`${key}: ${Array.isArray(value)?list(value):escapeYaml(value)}`); await fs.writeFile(file,`---\n${lines.join('\n')}\n---\n\n${body}\n`); }

const server=http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url, 'http://localhost');
    if (req.method==='GET' && url.pathname==='/') return text(res,200,await fs.readFile(path.join(captureDir,'index.html'),'utf8'));
    if (req.method==='GET' && url.pathname==='/app.js') return text(res,200,await fs.readFile(path.join(captureDir,'app.js'),'utf8'),'text/javascript; charset=utf-8');
    if (req.method==='GET' && url.pathname==='/style.css') return text(res,200,await fs.readFile(path.join(captureDir,'style.css'),'utf8'),'text/css; charset=utf-8');
    if (req.method==='GET' && url.pathname==='/api/entries') return json(res,200,await readEntries());
    if (req.method==='GET' && url.pathname.startsWith('/api/entry/')) { const id=decodeURIComponent(url.pathname.slice(11)); const found=(await readEntries(true)).find(entry=>entry.id===id); return found?json(res,200,found):json(res,404,{error:'Entry not found'}); }
    if (req.method==='POST' && url.pathname==='/api/entry') { const data=await body(req); if (!types.includes(data.type)||!data.title?.trim()) return json(res,400,{error:'Choose a type and give it a title.'}); const id=data.existingId || slugify(data.title); const file=await uniqueFile(id,data.existingId); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,markdown(data)); return json(res,200,{ok:true,id:path.relative(entriesDir,file).replace(/\.md$/,'').split(path.sep).join('/')}); }
    if (req.method==='DELETE' && url.pathname.startsWith('/api/entry/')) { const data=await body(req); if (data.confirm!==true) return json(res,400,{error:'Deletion must be confirmed.'}); const id=decodeURIComponent(url.pathname.slice(11)); const file=path.resolve(entriesDir,`${id}.md`); if (!file.startsWith(entriesDir+path.sep)) return json(res,400,{error:'Invalid entry'}); await fs.mkdir(trashDir,{recursive:true}); await fs.rename(file,path.join(trashDir,`${Date.now()}-${safeName(id)}.md`)); return json(res,200,{ok:true}); }
    if (req.method==='POST' && url.pathname==='/api/image') { const data=await body(req); const hit=(data.dataUrl||'').match(/^data:([^;]+);base64,(.+)$/); if (!hit) return json(res,400,{error:'Choose an image first.'}); const ext=(data.name||'').split('.').pop() || hit[1].split('/').pop() || 'jpg'; const name=`${Date.now()}-${safeName(slugify((data.name||'image').replace(/\.[^.]+$/,'')))}.${safeName(ext)}`; await fs.mkdir(publicImages,{recursive:true}); await fs.writeFile(path.join(publicImages,name),Buffer.from(hit[2],'base64')); return json(res,200,{url:`/images/${name}`}); }
    if (req.method==='GET' && url.pathname==='/api/currently') return json(res,200,await readSimple(currentlyFile));
    if (req.method==='PUT' && url.pathname==='/api/currently') { const data=await body(req); await writeSimple(currentlyFile,{...data,updated:new Date().toISOString().slice(0,10)}); return json(res,200,{ok:true}); }
    if (req.method==='GET' && url.pathname==='/api/life-list') { const raw=await fs.readFile(lifeListFile,'utf8'); const parsed=parseFrontmatter(raw).data; if (!Array.isArray(parsed.done)) { const section=(name)=>{const match=raw.match(new RegExp(`${name}:\\n((?:\\s+- .+\\n?)*)`)); return match?[...match[1].matchAll(/- (.+)/g)].map(x=>x[1]):[]}; parsed.done=section('done');parsed.next=section('next');parsed.someday=section('someday'); } return json(res,200,parsed); }
    if (req.method==='PUT' && url.pathname==='/api/life-list') { const data=await body(req); await writeSimple(lifeListFile,{updated:new Date().toISOString().slice(0,10),done:data.done||[],next:data.next||[],someday:data.someday||[]}); return json(res,200,{ok:true}); }
    return text(res,404,'Not found','text/plain');
  } catch (error) { console.error(error); return json(res,500,{error:error.message||'Something went wrong'}); }
});
server.listen(4322,'127.0.0.1',()=>console.log('Raj’s Corner Capture is ready at http://127.0.0.1:4322'));
