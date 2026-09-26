// limpia/marcadores> · interfaz: carga de archivos, pestañas, marcas y descarga. Usa las funciones de core.js.

(() => {
  const $ = id => document.getElementById(id);
  const PAGE = 200;
  const SOFT_LIMIT = 60000; // marcadores; sobre esto la página se pone lenta
  let files = [], mode = 'mix';
  let original = null, work = null;
  let fgroups = [], groups = [], mergeResult = { merged: 0, skipped: [] };
  const decisions = new Map();   // duplicados: id -> 'move' | 'delete'
  const brokenDec = new Map();   // rotos: id -> 'move' | 'delete'
  const domainDec = new Map();   // por dominio: id -> 'move' | 'delete'
  // Plan de fusión por grupo de carpetas: key -> { on, dest: fid, exclude: Set<fid> }
  const mergePlan = new Map();
  const opts = { proto: true, www: true, slash: true, utm: true, locale: true, hash: false, site: true };
  const limits = { folders: PAGE, links: PAGE, broken: PAGE, domains: PAGE };
  let tab = 'folders';

  // ---------- Carga de archivos ----------
  const drop = $('drop'), fileInput = $('file');
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));

  const hasMarks = () => decisions.size || brokenDec.size || domainDec.size || [...mergePlan.values()].some(p => p.on);

  async function addFiles(list) {
    if (!list.length) return;
    drop.classList.add('busy');
    const added = [], failed = [];
    for (const file of list) {
      try {
        const entries = /\.zip$/i.test(file.name)
          ? (await unzipHtmlFiles(await file.arrayBuffer())).map(e => ({ name: file.name + ' › ' + e.name, text: e.text }))
          : [{ name: file.name, text: await file.text() }];
        let any = false;
        for (const e of entries) {
          const parsed = parseBookmarks(e.text);
          if (!parsed.links.length) continue;
          const trash = trashCount(parsed.root);
          added.push({ name: e.name, label: fileLabel(file.name), parsed, size: e.text.length, trash, includeTrash: false });
          any = true;
        }
        if (!any) failed.push(file.name);
      } catch (e) { failed.push(file.name); }
    }
    drop.classList.remove('busy');
    if (failed.length) alert('No se encontraron marcadores en: ' + failed.join(', '));
    if (!added.length) return;
    const total = files.concat(added).reduce((s, f) => s + f.parsed.links.length, 0);
    if (total > SOFT_LIMIT && !confirm(`Vas a tener ${total.toLocaleString('es')} marcadores cargados. Sobre ${SOFT_LIMIT.toLocaleString('es')} la página puede ponerse lenta. ¿Seguimos?`)) return;
    // Etiquetas únicas: «Brave», «Brave (2)»…
    for (const f of added) {
      let label = f.label, n = 2;
      while (files.some(x => x.label === label)) label = f.label + ' (' + n++ + ')';
      f.label = label;
      files.push(f);
    }
    recombine(true);
  }

  $('fileList').addEventListener('click', e => {
    const b = e.target.closest('button[data-rm]');
    if (!b) return;
    if (hasMarks() && !confirm('Quitar un archivo borra las marcas de marcadores que ya hiciste. ¿Seguimos?')) return;
    files.splice(Number(b.dataset.rm), 1);
    decisions.clear(); brokenDec.clear(); domainDec.clear();
    if (!files.length) { location.reload(); return; }
    recombine(false);
  });
  $('fileList').addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.trash !== undefined) {
      // Cambia qué marcadores existen, así que las marcas hechas dejan de calzar
      if (hasMarks() && !confirm('Cambiar la papelera borra las marcas de marcadores que ya hiciste. ¿Seguimos?')) { el.checked = !el.checked; return; }
      files[Number(el.dataset.trash)].includeTrash = el.checked;
      decisions.clear(); brokenDec.clear(); domainDec.clear();
      recombine(false);
      return;
    }
    const i = el.dataset.label;
    if (i === undefined) return;
    files[Number(i)].label = el.value.trim() || fileLabel(files[Number(i)].name);
    recombine(true);
  });
  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => {
    mode = r.value; recombine(false);
  }));

  // stableIds: los ids de carpeta anteriores siguen apuntando a lo mismo (solo se agregó al final)
  function recombine(stableIds) {
    original = combineTrees(files.map(f => ({ root: f.parsed.root, label: f.label, skipTrash: !f.includeTrash })), mode);
    fgroups = findFolderGroups(original.folders);
    const old = new Map(mergePlan);
    mergePlan.clear();
    for (const g of fgroups) {
      const fids = new Set(g.items.map(i => i.f.fid));
      const o = old.get(g.key);
      mergePlan.set(g.key, o && stableIds && fids.has(o.dest)
        ? { on: o.on, dest: o.dest, exclude: new Set([...o.exclude].filter(x => fids.has(x))) }
        : { on: o ? o.on : false, dest: g.defaultDest, exclude: new Set() });
    }
    $('stTotal').textContent = original.links.length.toLocaleString('es');
    $('stFolders').textContent = original.folders.length.toLocaleString('es');
    $('stFGroups').textContent = fgroups.length.toLocaleString('es');
    $('tabF').textContent = fgroups.length;
    renderFiles();
    $('app').classList.remove('hidden'); $('bar').classList.remove('hidden'); $('exportHelp').classList.add('hidden'); $('story').classList.add('hidden');
    drop.innerHTML = `<strong>${files.length} ${files.length === 1 ? 'archivo cargado' : 'archivos cargados'}</strong> · haz clic o arrastra más archivos para combinarlos`;
    rebuild();
  }

  function renderFiles() {
    const mb = n => (n / 1048576).toFixed(1) + ' MB';
    $('fileList').innerHTML = files.map((f, i) => `<div class="frow">
      <input type="text" data-label="${i}" value="${escapeHtml(f.label)}" size="12" title="Nombre corto del archivo">
      <span class="meta">${escapeHtml(f.name)} · ${f.parsed.links.length.toLocaleString('es')} marcadores · ${f.parsed.folders.length} carpetas · ${mb(f.size)}</span>
      <button data-rm="${i}">Quitar</button>
      ${f.trash ? `<label class="chk trash-opt"><input type="checkbox" data-trash="${i}" ${f.includeTrash ? 'checked' : ''}>
        incluir la papelera de este archivo (${f.trash.toLocaleString('es')} marcadores que ya habías borrado; ${f.includeTrash ? 'incluidos' : 'quedan fuera'})</label>` : ''}
      ${/safari/i.test(f.name) ? '<span class="warn safari-warn">⚠ Safari aún no se ha probado con un export real. Revisa que los totales coincidan con tus marcadores y revisa el resultado antes de borrar nada.</span>' : ''}</div>`).join('');
    const size = files.reduce((s, f) => s + f.size, 0);
    $('filesInfo').textContent = files.length > 1 ? `${files.length} archivos · ${mb(size)} en total` : '';
    $('modeRow').classList.toggle('hidden', files.length < 2);
  }

  // Árbol de trabajo = archivos combinados + fusiones de carpetas. Los duplicados se buscan sobre él.
  function rebuild() {
    const root = cloneTree(original.root);
    const plans = fgroups.filter(g => mergePlan.get(g.key).on).map(g => {
      const p = mergePlan.get(g.key);
      return { dest: p.dest, sources: g.items.map(i => i.f.fid).filter(fid => fid !== p.dest && !p.exclude.has(fid)) };
    });
    mergeResult = applyMerges(root, plans);
    work = indexTree(root);
    recomputeLinks(false);
    recomputeDomains();
    updateBrokenStats();
    renderTab();
  }

  function recomputeLinks(doRender = true) {
    groups = findGroups(work.links, opts);
    const inGroup = new Set(groups.flatMap(g => g.items.map(l => l.id)));
    for (const id of [...decisions.keys()]) if (!inGroup.has(id)) decisions.delete(id);
    $('stGroups').textContent = groups.length.toLocaleString('es');
    $('stExtra').textContent = groups.reduce((s, g) => s + g.items.length - 1, 0).toLocaleString('es');
    $('tabL').textContent = groups.length;
    $('linksNote').textContent = mergeResult.merged
      ? `Las rutas ya consideran las ${mergeResult.merged} carpetas fundidas en el paso 1.`
      : 'Tip: si primero fundes carpetas en el paso 1, aquí verás las rutas ya fusionadas.';
    if (doRender) renderTab();
  }

  function renderTab() {
    for (const t of ['folders', 'links', 'broken', 'domains']) $('tab-' + t).classList.toggle('hidden', tab !== t);
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    ({ folders: renderFolders, links: renderLinks, broken: renderBroken, domains: renderDomains })[tab]();
    updateSummary();
  }
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) { tab = b.dataset.tab; renderTab(); }
  });

  const fmtDate = t => t ? new Date(t * 1000).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' }) : 's/f';
  const fmtPath = p => escapeHtml(p.join(' › ') || '(raíz)');
  const srcTag = x => files.length > 1 && files[x.src] ? ` <span class="src">${escapeHtml(files[x.src].label)}</span>` : '';
  const moreBtn = (key, shown, total) => shown < total
    ? `<button class="more" data-more="${key}">Mostrar ${Math.min(PAGE, total - shown)} más (quedan ${total - shown})</button>` : '';
  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-more]');
    if (b) { limits[b.dataset.more] += PAGE; renderTab(); }
  });

  // ---------- Carpetas ----------
  let fcurrent = [];
  function visibleFGroups() {
    const q = $('fSearch').value.trim().toLowerCase();
    const show = $('fShow').value;
    return fgroups.filter(g => {
      const on = mergePlan.get(g.key).on;
      if (show === 'on' && !on) return false;
      if (show === 'off' && on) return false;
      return !q || g.key.includes(q) || g.items.some(i => i.f.path.join('/').toLowerCase().includes(q));
    });
  }

  function fgroupHtml(g) {
    const p = mergePlan.get(g.key);
    const destF = g.items.find(i => i.f.fid === p.dest).f;
    const blocked = i => i.f.fid !== p.dest && isInside(destF, i.f);
    const srcCount = g.items.filter(i => i.f.fid !== p.dest && !p.exclude.has(i.f.fid) && !blocked(i)).length;
    const status = p.on ? (srcCount ? `<span class="done">✓ se funden ${srcCount + 1} en una</span>` : '<span class="warn">nada que fundir</span>') : '';
    const names = [...new Set(g.items.map(i => decodeEntities(i.f.name)))].join(' / ');
    const rows = g.items.map(i => {
      const isDest = i.f.fid === p.dest, blk = blocked(i), inc = !p.exclude.has(i.f.fid) && !blk;
      const cls = !p.on ? '' : isDest ? 'f-dest' : inc ? 'f-src' : 'f-off';
      const subs = i.f.children.filter(c => c.type === 'folder').length;
      return `<div class="item ${cls}">
        <label class="chk"><input type="radio" name="dest-${escapeHtml(g.key)}" data-dest="${i.f.fid}" ${isDest ? 'checked' : ''}> Destino</label>
        <div class="ititle"><b>${fmtPath(i.f.path)}</b>${srcTag(i.f)}
          <div class="meta">${i.links} marcadores · ${subs} subcarpetas${blk ? ' · <span class="warn">contiene a la carpeta destino, no se puede fundir</span>' : ''}</div></div>
        ${isDest ? '<span class="meta">recibe el contenido</span>'
          : `<label class="chk"><input type="checkbox" data-inc="${i.f.fid}" ${inc ? 'checked' : ''} ${blk ? 'disabled' : ''}> incluir</label>`}
      </div>`;
    }).join('');
    return `<div class="group" data-fg="${escapeHtml(g.key)}"><div class="ghead">
      <label class="chk"><input type="checkbox" data-on ${p.on ? 'checked' : ''}> Fundir</label>
      <span class="badge">×${g.items.length}</span><span class="gname">${escapeHtml(names)}</span>${status}</div>${rows}</div>`;
  }

  function renderFolders() {
    fcurrent = visibleFGroups();
    const shown = fcurrent.slice(0, limits.folders);
    $('fgroups').innerHTML = shown.length ? shown.map(fgroupHtml).join('') + moreBtn('folders', shown.length, fcurrent.length)
      : '<div class="empty">No hay carpetas repetidas que coincidan.</div>';
    const sk = mergeResult.skipped.length;
    $('fShown').textContent = `${fcurrent.length} de ${fgroups.length} grupos` +
      (sk ? ` · ${sk} fusiones omitidas porque una carpeta contenía a su destino` : '');
  }

  $('fgroups').addEventListener('change', e => {
    const el = e.target, card = el.closest('.group');
    if (!card) return;
    const p = mergePlan.get(card.dataset.fg);
    if (el.dataset.on !== undefined) p.on = el.checked;
    else if (el.dataset.dest) { p.dest = Number(el.dataset.dest); p.exclude.delete(p.dest); p.on = true; }
    else if (el.dataset.inc) { const fid = Number(el.dataset.inc); el.checked ? p.exclude.delete(fid) : p.exclude.add(fid); }
    rebuild();
  });
  $('fAll').addEventListener('click', () => { visibleFGroups().forEach(g => { mergePlan.get(g.key).on = true; }); rebuild(); });
  $('fNone').addEventListener('click', () => { mergePlan.forEach(p => { p.on = false; }); rebuild(); });
  let ft;
  $('fSearch').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => { limits.folders = PAGE; renderFolders(); }, 150); });
  $('fShow').addEventListener('change', () => { limits.folders = PAGE; renderFolders(); });

  // ---------- Marcadores duplicados ----------
  const dec = l => decisions.get(l.id) || 'keep';
  const isResolved = g => g.items.filter(l => dec(l) === 'keep').length <= 1;
  const matches = (l, q) => l.href.toLowerCase().includes(q) ||
    decodeEntities(l.title).toLowerCase().includes(q) || l.path.join('/').toLowerCase().includes(q);

  function visibleGroups() {
    const q = $('search').value.trim().toLowerCase();
    const show = $('show').value;
    let list = groups.filter(g => {
      if (show === 'pending' && isResolved(g)) return false;
      if (show === 'resolved' && !isResolved(g)) return false;
      if (show === 'similar' && !g.similar) return false;
      return !q || g.key.toLowerCase().includes(q) || g.items.some(l => matches(l, q));
    });
    const s = $('sort').value;
    if (s === 'count') list = list.slice().sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
    else if (s === 'url') list = list.slice().sort((a, b) => a.key.localeCompare(b.key));
    return list;
  }

  function segHtml(id, d, attr) {
    return '<div class="seg">' + ['keep', 'move', 'delete'].map(a =>
      `<button ${attr}="${a}" data-id="${id}" class="${d === a ? 'on' : ''}" data-a-style="${a}">${{ keep: 'Mantener', move: 'Mover', delete: 'Eliminar' }[a]}</button>`).join('') + '</div>';
  }
  const statusTag = l => {
    const s = linkStatus.get(l.href.trim());
    return s && s !== 'ok' ? ` · <span class="st st-${STATUS[s][1]}">${STATUS[s][0]}</span>` : '';
  };

  function groupHtml(g) {
    const kept = g.items.filter(l => dec(l) === 'keep').length;
    const status = kept === 0 ? '<span class="warn">⚠ no se conserva ninguna copia</span>'
      : kept === 1 ? '<span class="done">✓ resuelto</span>' : '';
    const items = g.items.map(l => {
      const d = dec(l);
      const title = decodeEntities(l.title) || '(sin título)';
      return `<div class="item s-${d}">
        ${segHtml(l.id, d, 'data-a')}
        <div class="ititle"><a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${srcTag(l)}
          <div class="meta">📁 ${fmtPath(l.path)} · ${fmtDate(l.addDate)}${l.href.trim() !== g.items[0].href.trim() ? ' · ' + escapeHtml(l.href) : ''}${statusTag(l)}</div></div>
        <button class="only" data-only="${l.id}" title="Conservar este y aplicar la acción masiva al resto">Solo este</button>
      </div>`;
    }).join('');
    return `<div class="group"><div class="ghead"><span class="badge">×${g.items.length}</span>
      <span class="gurl">${escapeHtml(g.items[0].href)}</span>${g.similar
        ? '<span class="similar" title="Son portadas del mismo sitio en otro país o redirecciones: revisa antes de borrar">parecidos</span>' : ''}${status}</div>${items}</div>`;
  }

  let current = [];
  function renderLinks() {
    current = visibleGroups();
    const shown = current.slice(0, limits.links);
    $('groups').innerHTML = shown.length ? shown.map(groupHtml).join('') + moreBtn('links', shown.length, current.length)
      : '<div class="empty">No hay grupos que coincidan.</div>';
    $('shown').textContent = `${current.length} de ${groups.length} grupos`;
  }

  function pickKeeper(items, how) {
    if (how === 'first') return items[0];
    const withDate = items.filter(l => l.addDate);
    if (!withDate.length) return items[0];
    return withDate.reduce((a, b) => (how === 'oldest' ? b.addDate < a.addDate : b.addDate > a.addDate) ? b : a);
  }

  function setGroup(g, keeper) {
    const act = $('bulkAct').value;
    for (const l of g.items) {
      if (l === keeper) decisions.delete(l.id); else decisions.set(l.id, act);
    }
  }

  $('groups').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.dataset.more) return;
    const el = b.closest('.group');
    const gi = [...$('groups').children].indexOf(el);
    if (b.dataset.a) {
      const id = Number(b.dataset.id);
      if (b.dataset.a === 'keep') decisions.delete(id); else decisions.set(id, b.dataset.a);
    } else if (b.dataset.only) {
      const g = current[gi];
      setGroup(g, g.items.find(l => l.id === Number(b.dataset.only)));
    }
    // Redibuja solo este grupo
    const tmp = document.createElement('div');
    tmp.innerHTML = groupHtml(current[gi]);
    el.replaceWith(tmp.firstElementChild);
    updateSummary();
  });

  $('bulkApply').addEventListener('click', () => {
    // Los «parecidos» llevan a sitios que pueden ser distintos: solo entran si se pide
    const all = visibleGroups(), list = $('bulkSimilar').checked ? all : all.filter(g => !g.similar);
    const act = $('bulkAct').value === 'delete' ? 'eliminar' : 'mover';
    const skipped = all.length - list.length;
    if (!confirm(`Se conservará una copia en ${list.length} grupos y el resto se marcará para ${act}.` +
      (skipped ? ` Quedan fuera ${skipped} grupos «parecidos».` : '') + ' ¿Seguimos?')) return;
    const how = $('bulkKeep').value;
    for (const g of list) setGroup(g, pickKeeper(g.items, how));
    renderTab();
  });
  $('reset').addEventListener('click', () => { if (confirm('¿Quitar todas las marcas de duplicados?')) { decisions.clear(); renderTab(); } });
  document.querySelectorAll('[data-opt]').forEach(cb => cb.addEventListener('change', () => {
    opts[cb.dataset.opt] = cb.checked; recomputeLinks();
  }));
  let t;
  $('search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { limits.links = PAGE; renderLinks(); }, 150); });
  $('show').addEventListener('change', () => { limits.links = PAGE; renderLinks(); });
  $('sort').addEventListener('change', () => { limits.links = PAGE; renderLinks(); });

  // ---------- Links rotos ----------
  const linkStatus = new Map(); // href -> estado; sobrevive a fusiones y a cargar más archivos
  const dnsCache = new Map();
  const STATUS = {
    ok: ['Responde', 'ok'], dns: ['El dominio ya no existe', 'bad'], error: ['No se pudo abrir', 'warn'],
    timeout: ['Tiempo agotado', 'warn'], unknown: ['Sin verificar (http)', 'na'],
    local: ['Red local', 'na'], skip: ['No es un sitio web', 'na'],
  };
  const FILTERS = {
    broken: s => s === 'dns' || s === 'error' || s === 'timeout',
    dns: s => s === 'dns', noresp: s => s === 'error' || s === 'timeout',
    na: s => s && STATUS[s][1] === 'na', ok: s => s === 'ok',
  };
  let checking = null;

  function updateBrokenStats() {
    const checked = work.links.filter(l => linkStatus.has(l.href.trim()));
    const dead = checked.filter(l => FILTERS.dns(linkStatus.get(l.href.trim()))).length;
    const suspect = checked.filter(l => FILTERS.noresp(linkStatus.get(l.href.trim()))).length;
    const any = checked.length > 0;
    $('stBroken').textContent = any ? dead.toLocaleString('es') : '—';
    $('stSuspect').textContent = any ? `+ ${suspect.toLocaleString('es')} sospechosos` : '';
    $('tabB').textContent = any ? dead : '—';
    const pending = new Set(work.links.map(l => l.href.trim()).filter(h => !linkStatus.has(h))).size;
    if (!checking) {
      $('bCheck').textContent = !any ? 'Revisar links' : pending ? `Revisar pendientes (${pending})` : 'Todo revisado';
      $('bCheck').disabled = any && !pending;
      $('bRecheck').disabled = !suspect;
    }
  }

  async function startCheck(onlyBroken) {
    if (checking) { checking.abort(); $('bCheck').textContent = 'Deteniendo…'; $('bCheck').disabled = true; return; }
    const all = [...new Set(work.links.map(l => l.href.trim()))];
    // Revisar de nuevo solo tiene sentido con los sospechosos: un dominio inexistente no vuelve solo
    const hrefs = onlyBroken ? all.filter(h => FILTERS.noresp(linkStatus.get(h))) : all.filter(h => !linkStatus.has(h));
    if (!hrefs.length) return;
    if (onlyBroken) hrefs.forEach(h => linkStatus.delete(h));
    checking = new AbortController();
    const signal = checking.signal;
    $('bCheck').textContent = 'Detener'; $('bCheck').disabled = false; $('bRecheck').disabled = true;
    const o = { useDns: $('useDns').checked, dnsCache, signal, pageIsHttps: location.protocol === 'https:' };
    let done = 0, dead = 0, suspect = 0, last = 0;
    const progress = () => {
      $('progBar').style.width = (100 * done / hrefs.length).toFixed(1) + '%';
      $('progText').textContent = `${done.toLocaleString('es')} de ${hrefs.length.toLocaleString('es')} links revisados · ${dead} con dominio inexistente · ${suspect} sospechosos`;
    };
    progress();
    await runPool(hrefs, async h => {
      const st = await checkUrl(h, o);
      if (signal.aborted) return;
      linkStatus.set(h, st);
      done++; if (st === 'dns') dead++; else if (FILTERS.noresp(st)) suspect++;
      progress();
      if (Date.now() - last > 2000) { last = Date.now(); updateBrokenStats(); if (tab === 'broken') renderBroken(); }
    }, 12, signal);
    const stopped = signal.aborted;
    checking = null;
    progress();
    if (stopped) $('progText').textContent += ' · detenido';
    updateBrokenStats();
    renderTab();
  }
  $('bCheck').addEventListener('click', () => startCheck(false));
  $('bRecheck').addEventListener('click', () => startCheck(true));

  const bdec = l => brokenDec.get(l.id) || 'keep';
  let bcurrent = [];
  function visibleBroken() {
    const q = $('bSearch').value.trim().toLowerCase();
    const f = FILTERS[$('bShow').value];
    return work.links.filter(l => f(linkStatus.get(l.href.trim())) && (!q || matches(l, q)));
  }
  function brokenRowHtml(l) {
    const d = bdec(l), s = linkStatus.get(l.href.trim());
    const title = decodeEntities(l.title) || '(sin título)';
    return `<div class="item s-${d}" data-row="${l.id}">
      ${segHtml(l.id, d, 'data-b')}
      <div class="ititle"><a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${srcTag(l)}
        <div class="meta">📁 ${fmtPath(l.path)} · ${escapeHtml(l.href)}</div></div>
      <span class="st st-${STATUS[s][1]}">${STATUS[s][0]}</span>
    </div>`;
  }
  function renderBroken() {
    if (!work.links.some(l => linkStatus.has(l.href.trim()))) {
      $('broken').innerHTML = '<div class="empty">Aprieta «Revisar links» para empezar. Con unos 2.000 links distintos toma entre 3 y 5 minutos; puedes detenerla y seguir después.</div>';
      $('bShown').textContent = '';
      return;
    }
    bcurrent = visibleBroken();
    const shown = bcurrent.slice(0, limits.broken);
    $('broken').innerHTML = shown.length ? shown.map(brokenRowHtml).join('') + moreBtn('broken', shown.length, bcurrent.length)
      : '<div class="empty">No hay links en esta categoría.</div>';
    $('bShown').textContent = `${bcurrent.length} marcadores`;
  }
  $('broken').addEventListener('click', e => {
    const b = e.target.closest('button[data-b]');
    if (!b) return;
    const id = Number(b.dataset.id);
    if (b.dataset.b === 'keep') brokenDec.delete(id); else brokenDec.set(id, b.dataset.b);
    const row = b.closest('.item');
    const tmp = document.createElement('div');
    tmp.innerHTML = brokenRowHtml(work.links.find(l => l.id === id));
    row.replaceWith(tmp.firstElementChild);
    updateSummary();
  });
  $('bApply').addEventListener('click', () => {
    const list = visibleBroken(), act = $('bAct').value;
    if (act !== 'keep' && !confirm(`Se marcarán ${list.length} marcadores para ${act === 'delete' ? 'eliminar' : 'mover'}. ¿Seguimos?`)) return;
    for (const l of list) { if (act === 'keep') brokenDec.delete(l.id); else brokenDec.set(l.id, act); }
    renderTab();
  });
  let bt;
  $('bSearch').addEventListener('input', () => { clearTimeout(bt); bt = setTimeout(() => { limits.broken = PAGE; renderBroken(); }, 150); });
  $('bShow').addEventListener('change', () => { limits.broken = PAGE; renderBroken(); });

  // ---------- Por dominio ----------
  let dgroups = [], dSkipped = 0, dByKey = new Map(), linkDomain = new Map();
  const dOpen = new Set(); // grupos desplegados; sus marcadores se dibujan solo al abrirlos
  const ddec = l => domainDec.get(l.id) || 'keep';

  function recomputeDomains() {
    const r = findDomainGroups(work.links, $('dJoinTld').checked);
    dgroups = r.groups; dSkipped = r.skipped;
    dByKey = new Map(dgroups.map(g => [g.key, g]));
    linkDomain = new Map(dgroups.flatMap(g => g.items.map(l => [l.id, g.label])));
    for (const k of [...dOpen]) if (!dByKey.has(k)) dOpen.delete(k);
    $('tabD').textContent = dgroups.length;
  }

  function visibleDGroups() {
    const q = $('dSearch').value.trim().toLowerCase();
    const min = Number($('dMin').value);
    const list = dgroups.filter(g => g.items.length >= min &&
      (!q || g.domains.some(d => d.includes(q)) || g.items.some(l => matches(l, q))));
    return $('dSort').value === 'name' ? list.slice().sort((a, b) => a.label.localeCompare(b.label)) : list;
  }

  // Marcas hechas en otras pestañas, para no llevarse sorpresas al mover o borrar un dominio entero
  const otherTag = l => {
    const d = decisions.get(l.id), b = brokenDec.get(l.id);
    const t = [d && `duplicado: ${d === 'delete' ? 'eliminar' : 'mover'}`, b && `link roto: ${b === 'delete' ? 'eliminar' : 'mover'}`].filter(Boolean);
    return t.length ? ` · <span class="st st-na">${t.join(' · ')}</span>` : '';
  };
  function drowHtml(l) {
    const d = ddec(l);
    const title = decodeEntities(l.title) || '(sin título)';
    return `<div class="item s-${d}">
      ${segHtml(l.id, d, 'data-d')}
      <div class="ititle"><a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${srcTag(l)}
        <div class="meta">📁 ${fmtPath(l.path)} · ${escapeHtml(l.href)}${statusTag(l)}${otherTag(l)}</div></div>
    </div>`;
  }
  function dgroupHtml(g) {
    const acts = new Set(g.items.map(ddec));
    const all = acts.size === 1 ? [...acts][0] : '';
    const marked = g.items.filter(l => ddec(l) !== 'keep').length;
    const status = marked && !all ? `<span class="meta">${marked} marcados</span>` : '';
    const others = g.domains.length > 1 ? `<span class="meta">también ${g.domains.slice(1).map(escapeHtml).join(', ')}</span>` : '';
    const open = dOpen.has(g.key);
    return `<details class="group dgroup" data-dg="${escapeHtml(g.key)}"${open ? ' open' : ''}><summary class="ghead">
      ${segHtml('', all, 'data-dall')}<span class="badge">${g.items.length}</span>
      <span class="gname">${escapeHtml(g.label)} ${others}</span>${status}</summary>${open ? g.items.map(drowHtml).join('') : ''}</details>`;
  }

  let dcurrent = [];
  function renderDomains() {
    dcurrent = visibleDGroups();
    const shown = dcurrent.slice(0, limits.domains);
    $('dgroups').innerHTML = shown.length ? shown.map(dgroupHtml).join('') + moreBtn('domains', shown.length, dcurrent.length)
      : '<div class="empty">No hay dominios que coincidan.</div>';
    const n = dcurrent.reduce((s, g) => s + g.items.length, 0);
    $('dShown').textContent = `${dcurrent.length} de ${dgroups.length} dominios · ${n.toLocaleString('es')} marcadores` +
      (dSkipped ? ` · ${dSkipped} marcadores que no son sitios web quedan fuera` : '');
  }

  function setDomain(g, act) {
    for (const l of g.items) { if (act === 'keep') domainDec.delete(l.id); else domainDec.set(l.id, act); }
  }

  // toggle no burbujea: se escucha en captura. Al abrir un grupo se dibujan sus marcadores.
  $('dgroups').addEventListener('toggle', e => {
    const el = e.target, g = el.dataset && dByKey.get(el.dataset.dg);
    if (!g) return;
    if (!el.open) { dOpen.delete(g.key); return; }
    dOpen.add(g.key);
    if (!el.querySelector('.item')) el.insertAdjacentHTML('beforeend', g.items.map(drowHtml).join(''));
  }, true);
  $('dgroups').addEventListener('click', e => {
    const b = e.target.closest('button'), card = b && b.closest('.dgroup');
    if (!card) return;
    const g = dByKey.get(card.dataset.dg);
    if (b.dataset.dall) { e.preventDefault(); setDomain(g, b.dataset.dall); }
    else if (b.dataset.d) {
      const id = Number(b.dataset.id);
      if (b.dataset.d === 'keep') domainDec.delete(id); else domainDec.set(id, b.dataset.d);
    } else return;
    const tmp = document.createElement('div');
    tmp.innerHTML = dgroupHtml(g);
    card.replaceWith(tmp.firstElementChild);
    updateSummary();
  });
  $('dApply').addEventListener('click', () => {
    const list = visibleDGroups(), act = $('dAct').value;
    const n = list.reduce((s, g) => s + g.items.length, 0);
    if (act !== 'keep' && !confirm(`Se marcarán ${n.toLocaleString('es')} marcadores de ${list.length} dominios para ` +
      (act === 'delete' ? 'eliminar' : 'mover, cada dominio a su subcarpeta') + '. ¿Seguimos?')) return;
    for (const g of list) setDomain(g, act);
    renderTab();
  });
  $('dJoinTld').addEventListener('change', () => { recomputeDomains(); limits.domains = PAGE; renderTab(); });
  let dt;
  $('dSearch').addEventListener('input', () => { clearTimeout(dt); dt = setTimeout(() => { limits.domains = PAGE; renderDomains(); }, 150); });
  $('dMin').addEventListener('change', () => { limits.domains = PAGE; renderDomains(); });
  $('dSort').addEventListener('change', () => { limits.domains = PAGE; renderDomains(); });

  // ---------- Resumen y descarga ----------
  // Decisión final de cada marcador: eliminar gana; si no, rotos, luego duplicados y al final por dominio
  function decide(l) {
    const d1 = decisions.get(l.id), d2 = brokenDec.get(l.id), d3 = domainDec.get(l.id);
    if (d1 === 'delete' || d2 === 'delete' || d3 === 'delete') return 'delete';
    if (d2 === 'move') return $('brokenName').value.trim() || 'Links rotos';
    if (d1 === 'move') return $('moveName').value.trim() || 'Duplicados';
    if (d3 === 'move') return [$('domainName').value.trim() || 'Por dominio', linkDomain.get(l.id) || 'otros'];
    return 'keep';
  }

  function updateSummary() {
    if (!work) return;
    const counts = new Map(), dfolders = new Set();
    let dmoved = 0;
    for (const l of work.links) {
      const d = decide(l);
      if (Array.isArray(d)) { dmoved++; dfolders.add(d[1]); }
      else if (d !== 'keep') counts.set(d, (counts.get(d) || 0) + 1);
    }
    const parts = [];
    if (mergeResult.merged) parts.push(`<span class="merge-t">${mergeResult.merged}</span> carpetas fundidas`);
    if (counts.get('delete')) parts.push(`<span class="del-t">${counts.get('delete')}</span> marcadores para eliminar`);
    for (const [name, n] of counts) if (name !== 'delete') parts.push(`<span class="move-t">${n}</span> para mover a «${escapeHtml(name)}»`);
    if (dmoved) parts.push(`<span class="move-t">${dmoved}</span> para ordenar en «${escapeHtml($('domainName').value.trim() || 'Por dominio')}»` +
      ` (${dfolders.size} ${dfolders.size === 1 ? 'subcarpeta' : 'subcarpetas'})`);
    $('summary').innerHTML = parts.length ? parts.join(' · ') : files.length > 1 ? 'Archivos combinados, sin otros cambios.' : 'Todavía no has marcado cambios.';
    $('download').disabled = !parts.length && !$('pruneEmpty').checked && files.length < 2;
  }
  $('moveName').addEventListener('input', updateSummary);
  $('brokenName').addEventListener('input', updateSummary);
  $('domainName').addEventListener('input', updateSummary);
  $('pruneEmpty').addEventListener('change', updateSummary);

  $('download').addEventListener('click', () => {
    const { html } = serializeBookmarks(work.root, decide, $('pruneEmpty').checked);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = files.length > 1 ? 'marcadores_combinados_limpio.html'
      : files[0].name.split(' › ')[0].replace(/\.(html?|zip)$/i, '') + '_limpio.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
})();
