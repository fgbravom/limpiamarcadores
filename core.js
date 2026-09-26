// limpia/marcadores> · lógica pura: leer, combinar, fundir, detectar duplicados, exportar y revisar links.
// No toca el DOM. En el navegador se carga como script clásico (los módulos no funcionan desde file://);
// en Node se puede requerir para las pruebas.

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>';
    if (k === 'quot') return '"'; if (k === 'apos' || k === '#39') return "'";
    if (k[1] === 'x') return String.fromCodePoint(parseInt(k.slice(2), 16));
    return String.fromCodePoint(parseInt(k.slice(1), 10));
  });
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getAttr(raw, name) {
  const m = new RegExp('\\b' + name + '="([^"]*)"', 'i').exec(raw);
  return m ? decodeEntities(m[1]) : '';
}
// Nombre de carpeta comparable: sin tildes, sin mayúsculas, sin espacios sobrantes
function folderKey(rawName) {
  return decodeEntities(rawName).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Formato Netscape: <DL> abre una carpeta, <H3> la nombra, <A> es un marcador.
// Se guardan los atributos crudos (incluido ICON) para reexportar sin pérdidas.
function parseBookmarks(html) {
  const root = { type: 'folder', fid: -1, attrs: '', name: '', children: [] };
  const stack = [];
  let fid = 0, lid = 0, pending = null;
  const re = /<H3\b([^>]*)>([\s\S]*?)<\/H3>|<A\b([^>]*)>([\s\S]*?)<\/A>|<DL\b[^>]*>|<\/DL>/gi;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1] || root;
    if (m[1] !== undefined) {
      const f = { type: 'folder', fid: fid++, attrs: m[1], name: m[2], children: [] };
      top.children.push(f);
      pending = f;
    } else if (m[3] !== undefined) {
      top.children.push({ type: 'link', id: lid++, attrs: m[3], title: m[4],
        href: getAttr(m[3], 'HREF'), addDate: Number(getAttr(m[3], 'ADD_DATE')) || 0 });
    } else if (m[0][1] === '/') {
      if (stack.length) stack.pop();
    } else {
      stack.push(!stack.length ? root : (pending || top));
      pending = null;
    }
  }
  return indexTree(root);
}

// Recorre el árbol y calcula rutas, lista de marcadores y carpetas
function indexTree(root) {
  const links = [], folders = [];
  (function walk(f, path) {
    for (const c of f.children) {
      if (c.type === 'folder') {
        c.path = path.concat(decodeEntities(c.name));
        c.parent = f;
        folders.push(c);
        walk(c, c.path);
      } else {
        c.path = path;
        links.push(c);
      }
    }
  })(root, []);
  return { root, links, folders };
}

function cloneTree(f) {
  return { type: 'folder', fid: f.fid, src: f.src, attrs: f.attrs, name: f.name,
    children: f.children.map(c => c.type === 'folder' ? cloneTree(c)
      : { type: 'link', id: c.id, src: c.src, attrs: c.attrs, title: c.title, href: c.href, addDate: c.addDate }) };
}

// Nombre corto para un archivo: el navegador, si aparece en el nombre
function fileLabel(name) {
  const known = ['brave', 'chrome', 'chromium', 'edge', 'firefox', 'safari', 'opera', 'vivaldi', 'comet', 'arc', 'yandex', 'waterfox', 'librewolf', 'zen'];
  const n = name.toLowerCase();
  const hit = known.find(k => n.includes(k));
  return hit ? hit[0].toUpperCase() + hit.slice(1) : name.replace(/\.(html?|zip)$/i, '');
}

// Opera (y otros) exportan la papelera como una carpeta más en la raíz
const TRASH_NAMES = /^(papelera|trash|deleted|deleted items|eliminados|corbeille|lixeira|cestino|papierkorb)$/;
const isTrash = c => c.type === 'folder' && TRASH_NAMES.test(folderKey(c.name));
function trashCount(root) {
  return root.children.filter(isTrash).reduce((s, f) => s + countLinks(f), 0);
}

// Junta varios árboles en uno y renumera ids para que no choquen.
// mode 'mix': todo en la misma raíz · 'split': cada archivo dentro de una carpeta con su nombre.
// Con skipTrash se deja fuera la papelera de ese archivo.
// Agregar archivos al final no cambia los ids de los anteriores.
function combineTrees(sources, mode) {
  const root = { type: 'folder', fid: -1, attrs: '', name: '', children: [] };
  let fid = 0, lid = 0;
  const now = Math.floor(Date.now() / 1000);
  function renum(f, src) {
    for (const c of f.children) {
      c.src = src;
      if (c.type === 'folder') { c.fid = fid++; renum(c, src); } else c.id = lid++;
    }
  }
  sources.forEach((s, i) => {
    const copy = cloneTree(s.root);
    if (s.skipTrash) copy.children = copy.children.filter(c => !isTrash(c));
    if (mode === 'split' && sources.length > 1) {
      const wrap = { type: 'folder', fid: fid++, src: i, attrs: ' ADD_DATE="' + now + '" LAST_MODIFIED="' + now + '"',
        name: escapeHtml(s.label), children: copy.children };
      renum(wrap, i);
      root.children.push(wrap);
    } else {
      renum(copy, i);
      root.children.push(...copy.children);
    }
  });
  return indexTree(root);
}

function countLinks(f) {
  return f.children.reduce((s, c) => s + (c.type === 'folder' ? countLinks(c) : 1), 0);
}
// ¿node está dentro de ancestor? Usa los punteros parent de indexTree.
function isInside(node, ancestor) {
  for (let p = node.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

// Cada navegador le pone otro nombre a la barra («Barra de marcadores», «Barra de favoritos»,
// «Marcadores»…), así que las barras se agrupan por su marca y no por el nombre.
const TOOLBAR_KEY = '(barras de marcadores)';
const isToolbar = f => /\sPERSONAL_TOOLBAR_FOLDER="true"/i.test(f.attrs);

function findFolderGroups(folders) {
  const map = new Map();
  for (const f of folders) {
    const k = isToolbar(f) ? TOOLBAR_KEY : folderKey(f.name);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(f);
  }
  return [...map].filter(([, arr]) => arr.length > 1).map(([key, items]) => {
    const info = items.map(f => ({ f, links: countLinks(f), depth: f.path.length }));
    // Destino sugerido: la menos anidada; si empatan, la con más marcadores
    const dest = info.slice().sort((a, b) => a.depth - b.depth || b.links - a.links)[0].f;
    return { key, items: info, defaultDest: dest.fid };
  }).sort((a, b) => Math.min(...a.items.map(i => i.depth)) - Math.min(...b.items.map(i => i.depth)) || a.key.localeCompare(b.key));
}

// plans: [{ dest: fid, sources: [fid, ...] }] en orden de aplicación.
// Trabaja sobre un árbol ya clonado. Devuelve cuántas fusiones hizo y cuáles omitió.
function applyMerges(root, plans) {
  const byFid = new Map(), parent = new Map();
  (function walk(f) { for (const c of f.children) if (c.type === 'folder') { byFid.set(c.fid, c); parent.set(c, f); walk(c); } })(root);
  const redirect = new Map();
  const resolve = fid => { while (redirect.has(fid)) fid = redirect.get(fid); return byFid.get(fid); };
  const inside = (node, anc) => { for (let p = parent.get(node); p; p = parent.get(p)) if (p === anc) return true; return false; };
  let merged = 0; const skipped = [];
  function mergeInto(src, dest) {
    const p = parent.get(src);
    if (p) { const i = p.children.indexOf(src); if (i >= 0) p.children.splice(i, 1); }
    parent.delete(src);
    redirect.set(src.fid, dest.fid);
    merged++;
    const kids = src.children;
    src.children = [];
    for (const c of kids) {
      const twin = c.type === 'folder' && dest.children.find(d => d.type === 'folder' && folderKey(d.name) === folderKey(c.name));
      if (twin) mergeInto(c, twin);
      else { dest.children.push(c); if (c.type === 'folder') parent.set(c, dest); }
    }
  }
  for (const plan of plans) {
    for (const sfid of plan.sources) {
      const dest = resolve(plan.dest), src = resolve(sfid);
      if (!dest || !src || src === dest) continue;
      if (inside(dest, src)) { skipped.push(sfid); continue; }
      mergeInto(src, dest);
    }
  }
  return { merged, skipped };
}

// Parámetros que no cambian la página: rastreo de campañas, redes sociales, tiendas y buscadores
const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid|igshid|si|feature|ref|ref_src|referrer|referrerscenario|original_referer|spm|scm|gatewayadapt|algo_pvid|algo_expid|btsid|ws_ab_test|pvid|_ga|_gl|sourceid|ie|oq|aqs|gws_rd|pli)$/i;
// Idioma o país: es.aliexpress.com, m.youtube.com, ?hl=es. Lista explícita, porque códigos como
// id., my., go. o ai. suelen ser servicios (id.atlassian.com es el login, no Indonesia).
const LOCALE_SUB = /^((es|en|pt|fr|de|it|nl|pl|ru|ja|zh|ko|tr|sv|cl|ar|mx|co|pe|uy|ve|ec|bo|py|br|us|uk|ca|au|nz|ie|za|be|ch|at|dk|fi|no|se|gr|cz|ro|hu|jp|cn|kr|tw|hk|sg|in)(-[a-z]{2})?|m|mobile)$/;
const LOCALE_PARAMS = /^(hl|lang|locale|gl)$/i;

// Nombre del sitio sin subdominios ni TLD: aliexpress.com → aliexpress, amazon.co.uk → amazon.
// domain = dominio principal (amazon.co.uk). isRoot = el host es el dominio mismo (sin subdominios como pelom-erp.daia.cl).
function siteName(host) {
  const p = host.split('.');
  const sld = p.length >= 3 && /^(co|com|org|net|gob|gov|edu|ac|ne|or)$/.test(p[p.length - 2]);
  const reg = p.slice(sld ? -3 : -2);
  return { name: reg[0], domain: reg.join('.'), isRoot: p.length === reg.length };
}

function urlKey(href, o) {
  const raw = href.trim();
  let url;
  try { url = new URL(raw); } catch (e) { return raw; }
  if (!/^https?:$/.test(url.protocol)) return raw;
  let host = url.hostname.toLowerCase();
  if (o.www) host = host.replace(/^www\./, '');
  if (o.locale) {
    const labels = host.split('.');
    if (labels.length >= 3 && LOCALE_SUB.test(labels[0])) host = labels.slice(1).join('.');
  }
  let path = url.pathname;
  if (o.slash) path = path.replace(/\/+$/, '');
  let search = url.search;
  if (o.utm || o.locale) {
    const p = url.searchParams;
    [...p.keys()].forEach(k => { if ((o.utm && TRACKING_PARAMS.test(k)) || (o.locale && LOCALE_PARAMS.test(k))) p.delete(k); });
    const qs = p.toString();
    search = qs ? '?' + qs : '';
  }
  const hash = o.hash ? '' : url.hash;
  if (o.site) {
    // Vivaldi trae marcadores de socios que redirigen a la portada de la tienda: vivaldi.com/bk/aliexpress-cl
    const bk = /^\/bk\/([a-z0-9]+)[\w-]*\/?$/i.exec(url.pathname);
    if (host.replace(/^www\./, '') === 'vivaldi.com' && bk) return 'sitio:' + bk[1].toLowerCase();
    // Portadas del mismo sitio en otro país: aliexpress.com = aliexpress.cl
    // (nunca con puerto, localhost ni IP: localhost:3000 y localhost:8080 son apps distintas)
    const isLocal = url.port || !host.includes('.') || /^[\d.]+$|:/.test(host);
    if (!isLocal && !path.replace(/\/+$/, '') && !search && !hash) {
      const s = siteName(host.replace(/^www\./, ''));
      if (s.isRoot) return 'sitio:' + s.name;
    }
  }
  const proto = o.proto ? '' : url.protocol;
  return proto + '//' + host + (url.port ? ':' + url.port : '') + path + search + hash;
}

// similar = el grupo solo existe gracias a «juntar portadas»: sus URLs llevan a sitios distintos
function findGroups(links, o) {
  const map = new Map();
  for (const l of links) {
    const k = urlKey(l.href, o);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  }
  const strict = Object.assign({}, o, { site: false });
  return [...map].filter(([, arr]) => arr.length > 1).map(([key, items]) => ({
    key, items, similar: o.site && new Set(items.map(l => urlKey(l.href, strict))).size > 1,
  }));
}

// Plataformas donde cada subdominio es el sitio de otra persona: juan.github.io no es github.com
const HOSTING = /^(github\.io|gitlab\.io|vercel\.app|netlify\.app|pages\.dev|web\.app|firebaseapp\.com|appspot\.com|herokuapp\.com|onrender\.com|railway\.app|fly\.dev|glitch\.me|surge\.sh|streamlit\.app|notion\.site|mintlify\.app|webflow\.io|framer\.website|lovable\.app|replit\.app|azurewebsites\.net|wordpress\.com|wixsite\.com|weebly\.com|tumblr\.com|substack\.com|blogspot\.[a-z.]+)$/;

// Dominio principal de un link: gist.github.com → github.com, www.amazon.co.uk → amazon.co.uk,
// miapp.vercel.app → miapp.vercel.app. site = nombre sin TLD, para juntar el mismo sitio en otro país
// (foo.blogspot.com = foo.blogspot.cl); null en localhost e IPs.
function domainOf(href) {
  let url;
  try { url = new URL(href.trim()); } catch (e) { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.') || /^[\d.]+$|:/.test(host)) return { domain: host, site: null };
  const s = siteName(host);
  const user = !s.isRoot && HOSTING.test(s.domain) && host.slice(0, -s.domain.length - 1).split('.').pop();
  if (user && !LOCALE_SUB.test(user)) return { domain: user + '.' + s.domain, site: user + '.' + s.name };
  return { domain: s.domain, site: s.name };
}

// Todos los marcadores agrupados por dominio principal, de más a menos marcadores.
// Con joinTld, aliexpress.com y aliexpress.cl van juntos; el grupo lleva el nombre del dominio más usado.
// Los que no son sitios web (javascript:, file:, chrome://…) quedan fuera y se cuentan en skipped.
function findDomainGroups(links, joinTld) {
  const map = new Map();
  let skipped = 0;
  for (const l of links) {
    const d = domainOf(l.href);
    if (!d) { skipped++; continue; }
    const k = joinTld && d.site ? 'sitio:' + d.site : d.domain;
    if (!map.has(k)) map.set(k, { items: [], count: new Map() });
    const g = map.get(k);
    g.items.push(l);
    g.count.set(d.domain, (g.count.get(d.domain) || 0) + 1);
  }
  const groups = [...map].map(([key, g]) => {
    const domains = [...g.count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([d]) => d);
    return { key, label: domains[0], domains, items: g.items };
  }).sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
  return { groups, skipped };
}

// decide(link) -> 'keep' | 'delete' | nombre de la carpeta a la que se mueve | [carpeta, subcarpeta]
function serializeBookmarks(root, decide, pruneEmpty) {
  const moved = new Map();
  let toolbarSeen = false;
  const out = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>'];
  const linkLine = (l, ind) => ind + '<DT><A' + l.attrs + '>' + l.title + '</A>';
  // moved: carpeta -> subcarpeta ('' = directo en la carpeta) -> marcadores
  const addMoved = (d, l) => {
    const [name, sub = ''] = Array.isArray(d) ? d : [d];
    if (!moved.has(name)) moved.set(name, new Map());
    const subs = moved.get(name);
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub).push(l);
  };
  function hasContent(f) {
    return f.children.some(c => c.type === 'folder' ? (!pruneEmpty || hasContent(c)) : decide(c) === 'keep');
  }
  function collectMoved(f) {
    for (const c of f.children) {
      if (c.type === 'folder') collectMoved(c);
      else { const d = decide(c); if (d !== 'keep' && d !== 'delete') addMoved(d, c); }
    }
  }
  // Al combinar archivos puede haber varias barras de marcadores: solo la primera conserva la marca
  function folderAttrs(attrs) {
    if (!/\sPERSONAL_TOOLBAR_FOLDER="true"/i.test(attrs)) return attrs;
    if (!toolbarSeen) { toolbarSeen = true; return attrs; }
    return attrs.replace(/\s+PERSONAL_TOOLBAR_FOLDER="true"/i, '');
  }
  function walk(f, depth, extra) {
    const ind = '    '.repeat(depth);
    out.push(ind + '<DL><p>');
    for (const c of f.children) {
      if (c.type === 'folder') {
        if (pruneEmpty && !hasContent(c)) { collectMoved(c); continue; }
        out.push(ind + '    <DT><H3' + folderAttrs(c.attrs) + '>' + c.name + '</H3>');
        walk(c, depth + 1);
      } else {
        const d = decide(c);
        if (d === 'keep') out.push(linkLine(c, ind + '    '));
        else if (d !== 'delete') addMoved(d, c);
      }
    }
    if (extra) extra(ind + '    ');
    out.push(ind + '</DL><p>');
  }
  walk(root, 0, ind => {
    const now = Math.floor(Date.now() / 1000);
    const folder = (name, ind, list, subs) => {
      out.push(ind + '<DT><H3 ADD_DATE="' + now + '" LAST_MODIFIED="' + now + '">' + escapeHtml(name) + '</H3>');
      out.push(ind + '<DL><p>');
      for (const l of list) out.push(linkLine(l, ind + '    '));
      if (subs) for (const [sub, sl] of subs) folder(sub, ind + '    ', sl);
      out.push(ind + '</DL><p>');
    };
    for (const [name, subs] of moved) {
      const direct = subs.get('') || [];
      folder(name, ind, direct, [...subs].filter(([sub]) => sub).sort((a, b) => a[0].localeCompare(b[0])));
    }
  });
  const movedCount = [...moved.values()].reduce((s, subs) => s + [...subs.values()].reduce((t, a) => t + a.length, 0), 0);
  return { html: out.join('\n') + '\n', movedCount };
}

// Lector mínimo de ZIP (el export de Safari): devuelve los .html que contiene.
async function unzipHtmlFiles(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP inválido');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/\.html?$/i.test(name) || /(^|\/)__MACOSX\//.test(name)) continue;
    const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
    const data = u8.subarray(start, start + csize);
    let bytes;
    if (method === 0) bytes = data;
    else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out.push({ name: name.split(/[\\/]/).pop(), text: new TextDecoder().decode(bytes) });
  }
  return out;
}

// ---- Revisión de links ----
// Desde una página no se puede leer la respuesta de otro sitio (CORS), pero un fetch
// 'no-cors' igual distingue "el servidor respondió algo" de "no hubo conexión".
const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)|\.(local|localhost|lan|internal)$/i;

async function resolveHost(host, signal) { // true = existe · false = no existe · null = no se supo
  try {
    for (const type of ['A', 'AAAA']) {
      const r = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(host) + '&type=' + type,
        { headers: { accept: 'application/dns-json' }, signal });
      const j = await r.json();
      if (j.Status === 3) return false;
      if (j.Status !== 0) return null;
      if ((j.Answer || []).length) return true;
    }
    return false;
  } catch (e) { return null; }
}

async function probe(href, method, ms, signal) {
  if (signal && signal.aborted) return 'error';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const onAbort = () => ctl.abort();
  if (signal) signal.addEventListener('abort', onAbort);
  try {
    await fetch(href, { method, mode: 'no-cors', cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: ctl.signal });
    return 'ok';
  } catch (e) {
    return ctl.signal.aborted && !(signal && signal.aborted) ? 'timeout' : 'error';
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// Estados: ok · dns (dominio no existe) · error (no conecta) · timeout · unknown · local · skip
async function checkUrl(href, o) {
  let url;
  try { url = new URL(href.trim()); } catch (e) { return 'skip'; }
  if (!/^https?:$/.test(url.protocol)) return 'skip';
  const host = url.hostname;
  if (LOCAL_HOST.test(host) || !host.includes('.')) return 'local';
  const isIp = /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[');
  if (o.useDns && !isIp) {
    if (!o.dnsCache.has(host)) o.dnsCache.set(host, resolveHost(host, o.signal));
    if ((await o.dnsCache.get(host)) === false) return 'dns';
  }
  // Una página https no puede pedir recursos http (contenido mixto)
  if (url.protocol === 'http:' && o.pageIsHttps) return 'unknown';
  const ms = o.timeoutMs || 12000;
  let r = await probe(url.href, 'HEAD', ms, o.signal);
  if (r === 'error') r = await probe(url.href, 'GET', ms, o.signal); // algunos servidores rechazan HEAD
  return r;
}

async function runPool(items, worker, concurrency, signal) {
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < items.length && !(signal && signal.aborted)) await worker(items[i++]);
  }));
}

if (typeof module !== 'undefined') {
  module.exports = {
    decodeEntities,
    escapeHtml,
    getAttr,
    folderKey,
    parseBookmarks,
    indexTree,
    cloneTree,
    fileLabel,
    TRASH_NAMES,
    isTrash,
    trashCount,
    combineTrees,
    countLinks,
    isInside,
    TOOLBAR_KEY,
    isToolbar,
    findFolderGroups,
    applyMerges,
    TRACKING_PARAMS,
    LOCALE_SUB,
    LOCALE_PARAMS,
    siteName,
    urlKey,
    findGroups,
    HOSTING,
    domainOf,
    findDomainGroups,
    serializeBookmarks,
    unzipHtmlFiles,
    LOCAL_HOST,
    resolveHost,
    probe,
    checkUrl,
    runPool,
  };
}
