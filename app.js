(function () {
  'use strict';

  const APP_VERSION = '0.18.0';   // keep in step with VERSION in sw.js
  const STORE_KEY = 'abs-companion-v1';
  const PREFS_KEY = 'abs-companion-prefs';

  // ---------- state ----------
  function blankState() {
    return {
      version: 1,
      corp: '', ceo: '', startDate: '',
      campScale: '', totalRep: '',
      unlocked: {},            // id -> true (ship_* and adv_*)
      games: [],               // {scale,date,opp,win,credits,rep,boughtRep,notes,photos,summary,contracts}
      summary: { finalScale: '', finalRep: '', finalCapital: '', winner: '' },
      notes: DEFAULT_HOUSE_RULES,
      scaleRule: '',           // '' keep scale; 'N' raise by 1 every N games at the current scale
      purchases: [],           // {id, cost, afterGame, date}: unlocks bought, for the capital history
      rivals: {},              // corpId -> shared corporation file from another player
      battle: blankBattle(),
    };
  }

  function blankBattle() {
    return {
      round: 1, scale: null,
      helm: { seize: 0, jump: 0, tac: 0 },
      spent: { jump: 0, tac: 0 },
      bgs: [],                 // {id, ship, count, round, name, status: 'in'|'out'|'dead'}
      ledger: [],              // {round, amt, note, bg}
      nextBg: 1,
      nonCampaign: false,      // one-off game: all ship classes, no campaign advantages, not logged
      contracts: [],           // contract ids, e.g. 'J♠'
      advUsed: {},             // once-per-game/round advantages used, e.g. { adv_31: true }
    };
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? Object.assign(fallback, JSON.parse(raw)) : fallback;
    } catch (e) { return fallback; }
  }
  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
  }

  let state = load(STORE_KEY, blankState());
  // Campaigns get the default house rules added to their notes once (they can be edited or deleted after).
  function addHouseRules(st) {
    if (st.houseRulesAdded) return;
    const notes = st.notes || '';
    if (!notes.includes(DEFAULT_HOUSE_RULES)) {
      st.notes = notes ? notes.replace(/\s+$/, '') + '\n\n' + DEFAULT_HOUSE_RULES : DEFAULT_HOUSE_RULES;
    }
    st.houseRulesAdded = true;
  }
  if (!state.houseRulesAdded) { addHouseRules(state); store(STORE_KEY, state); }
  // Stable id for this corporation, so rivals' copies of it update instead of duplicating.
  if (!state.corpId) { state.corpId = newId(); store(STORE_KEY, state); }
  // Purchases now come from the purchase history; keep any old typed text by moving it into the game's notes.
  function movePurchaseText(games) {
    let moved = false;
    (games || []).forEach((g) => {
      if (g.purchases) {
        g.notes = (g.notes ? g.notes.replace(/\s+$/, '') + '\n' : '') + 'Purchased: ' + g.purchases;
        moved = true;
      }
      delete g.purchases;
    });
    return moved;
  }
  if (movePurchaseText(state.games)) store(STORE_KEY, state);
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  const prefs = load(PREFS_KEY, { tab: 'overview', shipFilter: 'mine' });
  prefs.tab = { campaign: 'overview', games: 'log', ships: 'stats', more: 'overview' }[prefs.tab] || prefs.tab;   // renamed tabs

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store(STORE_KEY, state), 250);
    try { schedulePush(); } catch (err) { /* online sync not ready yet */ }
  }
  function savePrefs() { store(PREFS_KEY, prefs); }

  // ---------- helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  const ALL_ADVS = ADVANTAGES.flatMap((t) => t.items.map(([id, lvl, name, desc]) => ({ id, lvl, name, desc, tree: t.tree })));

  function isOwned(ship) { return ship.always || !!state.unlocked[ship.id]; }

  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function setPath(obj, path, val) {
    const keys = path.split('.'); const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
    target[last] = val;
  }

  // ---------- capital ----------
  function capital() {
    const total = STARTING_CAPITAL + state.games.reduce((s, g) => s + num(g.scale), 0);
    let spent = 0;
    SHIPS.forEach((s) => { if (!s.always && state.unlocked[s.id]) spent += s.cost; });
    ALL_ADVS.forEach((a) => { if (state.unlocked[a.id]) spent += a.lvl; });
    state.games.forEach((g) => { if (g.boughtRep) spent += REP_PURCHASE_COST; });
    return { total, spent, avail: total - spent };
  }

  function renderStatus() {
    const c = capital();
    $('#st-total').textContent = c.total;
    const av = $('#st-avail');
    av.textContent = c.avail;
    av.classList.toggle('neg', c.avail < 0);
    const ua = $('#unl-avail');
    ua.textContent = c.avail;
    ua.classList.toggle('neg', c.avail < 0);
    const rep = reputation();
    $('#st-rep').textContent = rep;
    $('#hdr-rep-val').textContent = rep;
    $('#st-games').textContent = state.games.length;
    $('#hdr-corp').textContent = state.corp || 'Unnamed corporation';
    renderStandings();
  }

  // Campaign reputation: win +1, positive final credits +1 (entered per game), +1 per 10 capital spent on rep.
  function reputation() {
    return state.games.reduce((s, g) => s + num(g.rep) + (g.boughtRep ? 1 : 0), 0);
  }

  // ---------- bound fields ----------
  function renderBound() {
    $$('[data-bind]').forEach((el) => {
      const v = getPath(state, el.dataset.bind);
      el.value = v == null ? '' : v;
    });
  }
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.bind) return;
    setPath(state, el.dataset.bind, el.value);
    save();
    if (el.dataset.bind === 'corp') renderStatus();
    if (el.dataset.bind === 'campScale') renderBattle();
  });

  // ---------- unlocks ----------
  const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function advDetail(a) {
    const [req, text] = ADV_DETAILS[a.id];
    return `<div class="expand-body adv-full">
      <p class="req"><b>Requires:</b> ${esc(req)}</p>
      <p>${esc(text)}</p>
      ${/ or Level/.test(req) ? `<p class="hint small">${esc(ADV_FAQ_NOTE)}</p>` : ''}
    </div>`;
  }

  function renderUnlocks() {
    // Ships: tap the name to show stats; only one open at a time.
    $('#ship-checklist').innerHTML = SHIPS.map((s) => {
      const on = isOwned(s);
      return `<div class="item-wrap" data-ship-row="${s.id}">
        <div class="item ${on ? 'on' : ''} ${s.always ? 'locked' : ''}">
          <input type="checkbox" data-unlock="${s.id}" ${on ? 'checked' : ''} ${s.always ? 'disabled' : ''} aria-label="Unlock ${esc(s.name)}">
          <button type="button" class="name namebtn" data-toggle-ship="${s.id}" aria-expanded="false">
            ${esc(s.name)}${s.wz ? '<span class="badge wz">WZ</span>' : ''}${CHEVRON}
            ${s.always ? '<small>Always available</small>' : ''}
          </button>
          <span class="cost">${s.always ? '–' : s.cost}</span>
        </div>
        <div class="expand-body ship-mini" hidden>${shipBody(s)}</div>
      </div>`;
    }).join('');

    // Advantages: chevron expands the full rules.
    $('#adv-checklist').innerHTML = ADVANTAGES.map((t) => `
      <div class="tree"><h3>${esc(t.tree)}</h3><div class="list">
        ${t.items.map(([id, lvl, name, desc]) => {
          const on = !!state.unlocked[id];
          const blocked = !on && !advEligible(id, state.unlocked);
          return `<div class="item-wrap">
            <div class="item ${on ? 'on' : ''} ${blocked ? 'blocked' : ''}">
              <input type="checkbox" data-unlock="${id}" ${on ? 'checked' : ''} aria-label="Research ${esc(name)}">
              <span class="name"><span class="lvl">L${lvl}</span>${esc(name)}<small>${esc(desc)}</small>${blocked ? '<small class="needs">Prerequisites not met</small>' : ''}</span>
              <span class="cost">${lvl}</span>
              <button type="button" class="chevbtn" data-toggle-adv aria-expanded="false" aria-label="Full rules for ${esc(name)}">${CHEVRON}</button>
            </div>
            ${advDetail({ id })}
          </div>`;
        }).join('')}
      </div></div>`).join('');
    $$('#adv-checklist .adv-full').forEach((el) => { el.hidden = true; });
    renderBuyNow();
  }

  // Unlock options you can take right now: affordable, not owned, prerequisites met.
  function renderBuyNow() {
    const avail = capital().avail;
    const ships = SHIPS.filter((s) => !isOwned(s)).map((s) => ({ id: s.id, name: s.name, cost: s.cost, kind: 'Mass ' + s.mass }));
    const advs = ALL_ADVS.filter((a) => advEligible(a.id, state.unlocked))
      .map((a) => ({ id: a.id, name: a.name, cost: a.lvl, kind: 'L' + a.lvl + ' ' + a.tree }));
    const row = (o, buy) => `<div class="buy-row ${buy ? '' : 'later'}"><span class="bn">${esc(o.name)}<small>${esc(o.kind)}</small></span>
      <span class="cost">${o.cost}</span>${buy ? `<button type="button" class="btn sm" data-buy="${o.id}">Buy</button>` : ''}</div>`;
    const byCost = (x, y) => x.cost - y.cost;
    const split = (items) => [items.filter((o) => o.cost <= avail).sort(byCost), items.filter((o) => o.cost > avail).sort(byCost)];
    const [shipsNow] = split(ships), [advsNow] = split(advs);
    const group = (title, items, empty) => `<div class="buy-group"><h4>${title}</h4>
      ${items.length ? items.map((o) => row(o, true)).join('') : `<p class="none">${empty}</p>`}</div>`;
    $('#buynow-count').textContent = '(' + (shipsNow.length + advsNow.length) + ')';
    $('#buynow-list').innerHTML =
      group('Ship classes', shipsNow, 'No ship classes affordable right now.') +
      group('Competitive advantages', advsNow, 'No advantages available right now.') +
      '<p class="hint small">Only one Level 0 advantage, and you may research one advantage per campaign game.</p>';
  }
  $('#buynow-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (!b) return;
    setUnlocked(b.dataset.buy, true);
  });

  function setOpen(btn, body, open) {
    body.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.closest('.item-wrap, .slot, .adv').classList.toggle('open', open);
  }
  document.addEventListener('click', (e) => {
    const sb = e.target.closest('[data-toggle-ship]');
    if (sb) {
      const wrap = sb.closest('.item-wrap');
      const opening = sb.getAttribute('aria-expanded') !== 'true';
      $$('#ship-checklist [data-toggle-ship][aria-expanded="true"]').forEach((b) =>
        setOpen(b, b.closest('.item-wrap').querySelector('.expand-body'), false));
      setOpen(sb, wrap.querySelector('.expand-body'), opening);
      return;
    }
    const row = e.target.closest('#advs-owned-list .adv');
    const ab = e.target.closest('[data-toggle-adv]') || (row && row.querySelector('[data-toggle-adv]'));
    if (ab) {
      const body = ab.closest('.item-wrap, .adv').querySelector('.expand-body');
      setOpen(ab, body, body.hidden);
    }
  });
  function unlockCost(id) {
    const s = SHIPS.find((x) => x.id === id);
    return s ? s.cost : ALL_ADVS.find((a) => a.id === id).lvl;
  }
  // Buy or un-buy an unlock, keeping a dated record of when it was bought (after which game).
  function setUnlocked(id, on) {
    state.purchases = state.purchases || [];
    if (on) {
      state.unlocked[id] = true;
      state.purchases.push({ id, cost: unlockCost(id), afterGame: state.games.length, date: new Date().toISOString().slice(0, 10) });
    } else {
      delete state.unlocked[id];
      const i = state.purchases.map((p) => p.id).lastIndexOf(id);
      if (i >= 0) state.purchases.splice(i, 1);
    }
    save(); renderUnlocks(); renderStatus(); renderShips(); renderBattle(); renderGames();
  }
  document.addEventListener('change', (e) => {
    const id = e.target.dataset && e.target.dataset.unlock;
    if (id) setUnlocked(id, e.target.checked);
  });

  // ---------- games ----------
  function renderGames() {
    const list = $('#game-list');
    $('#game-empty').hidden = state.games.length > 0;
    const unlockName = (id) => (SHIPS.find((x) => x.id === id) || ALL_ADVS.find((a) => a.id === id)).name;
    const recorded = new Set((state.purchases || []).map((p) => p.id));
    const undated = Object.keys(state.unlocked).filter((id) => !recorded.has(id));
    const buys = (n) => {
      const ps = (state.purchases || []).map((p, i) => Object.assign({ idx: i }, p)).filter((p) => p.afterGame === n);
      const extra = n === 0 ? undated.map((id) => ({ id, cost: unlockCost(id), undated: true })) : [];
      const all = extra.concat(ps);
      if (!all.length) return '';
      const total = all.reduce((t, p) => t + p.cost, 0);
      return `<div class="buys"><div class="buys-h">${n === 0 ? 'Bought before the first game' : 'Bought after game ' + n}<span>−${total} capital</span></div>
        ${all.map((p) => `<button type="button" class="buy-item" ${p.undated ? `data-when-id="${p.id}"` : `data-when-idx="${p.idx}"`}>
          <span>${esc(unlockName(p.id))}${p.undated && state.games.length ? ' <small>(tap to set when)</small>' : ''}</span><b>${p.cost}</b></button>`).join('')}</div>`;
    };
    list.innerHTML = buys(0) + state.games.map((g, i) => {
      const bits = [];
      if (g.scale !== '' && g.scale != null) bits.push('Scale ' + esc(g.scale));
      if (g.credits) bits.push(esc(g.credits) + ' credits');
      if (g.rep) bits.push('+' + esc(g.rep) + ' rep');
      if (g.boughtRep) bits.push('bought rep (−10)');
      if (g.date) bits.push(esc(g.date));
      const extra = g.notes || '';
      return `<div class="game" data-game="${i}" role="button" tabindex="0">
        <span class="num">${i + 1}</span>
        <span class="opp">${g.opp ? 'vs ' + esc(g.opp) : '<span style="color:var(--muted)">Game ' + (i + 1) + '</span>'}</span>
        ${g.win ? `<span class="res ${esc(g.win)}">${esc(g.win)}</span>` : '<span></span>'}
        <span class="meta">${bits.join(' · ') || 'Tap to edit'}</span>
        ${extra ? `<div class="extra">${esc(extra)}</div>` : ''}
        ${(g.photos || []).length ? `<div class="game-thumbs">${g.photos.map((id) => `<span class="thumb"><img data-photo="${id}" alt="Photo from game ${i + 1}"></span>`).join('')}</div>` : ''}
        ${g.summary ? `<button type="button" class="sumbtn" data-sum="${i}" aria-expanded="false">Game summary ${CHEVRON}</button>
          <div class="sum-wrap" hidden>${summaryHtml(g.summary)}</div>` : ''}
      </div>${buys(i + 1)}`;
    }).join('');
    loadThumbs(list);
    renderCampaignStats();
  }

  const dlg = $('#game-dialog');
  const form = $('#game-form');
  let editing = -1;
  let fromBattle = false;    // saving this dialog finishes the current Battle
  let pendingSummary = null; // post-game summary to store with the logged game
  let repTouched = false;    // stop auto-suggesting rep once the player edits it

  function openGame(i, prefill) {
    editing = i;
    fromBattle = !!prefill;
    const g = i >= 0 ? state.games[i]
      : Object.assign({ scale: state.campScale || '', date: new Date().toISOString().slice(0, 10) }, prefill);
    repTouched = i >= 0;
    $('#game-dialog-title').textContent = i >= 0 ? 'Game ' + (i + 1) : 'Log game ' + (state.games.length + 1);
    $('#btn-del-game').hidden = i < 0;
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      if (el.type === 'checkbox') el.checked = !!g[el.name];
      else el.value = g[el.name] == null ? '' : g[el.name];
    });
    if (i < 0) suggestRep();
    dialogPhotos = (g.photos || []).slice();
    renderDialogPhotos();
    renderDialogBuys(i);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function renderDialogBuys(i) {
    const n = i >= 0 ? i + 1 : state.games.length + 1;
    const ps = (state.purchases || []).filter((p) => p.afterGame === n);
    const name = (id) => (SHIPS.find((x) => x.id === id) || ALL_ADVS.find((a) => a.id === id)).name;
    $('#dlg-buys').innerHTML = ps.length
      ? ps.map((p) => `<div class="buy-item"><span>${esc(name(p.id))}</span><b>${p.cost}</b></div>`).join('') +
        `<p class="hint small">−${ps.reduce((t, p) => t + p.cost, 0)} capital. Change these on the Log by tapping a purchase.</p>`
      : `<p class="hint small">${i >= 0 ? 'Nothing recorded.' : 'Nothing yet.'} Unlocks you tick after logging this game are recorded here automatically; tap a purchase on the Log to move it.</p>`;
  }
  function closeGame() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  $('#btn-add-game').addEventListener('click', () => openGame(-1));
  $('#game-list').addEventListener('click', (e) => {
    const bi = e.target.closest('.buy-item');
    if (bi) { openWhen(bi); return; }
    const sb = e.target.closest('[data-sum]');
    if (sb) {
      const w = sb.nextElementSibling;
      w.hidden = !w.hidden;
      sb.setAttribute('aria-expanded', String(!w.hidden));
      return;
    }
    if (e.target.closest('.sum-wrap')) return;
    const card = e.target.closest('[data-game]');
    if (card) openGame(+card.dataset.game);
  });
  $('#game-list').addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-game]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openGame(+card.dataset.game); }
  });
  $('#btn-cancel-game').addEventListener('click', () => { dialogPhotos = []; closeGame(); prunePhotos(); });
  $('#btn-del-game').addEventListener('click', () => {
    if (editing < 0 || !confirm('Delete game ' + (editing + 1) + '?')) return;
    state.games.splice(editing, 1);
    dialogPhotos = [];
    save(); closeGame(); renderGames(); renderStatus(); prunePhotos();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      g[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    g.photos = dialogPhotos.slice();
    dialogPhotos = [];
    if (editing >= 0) {
      const old = state.games[editing];
      if (old.summary) g.summary = old.summary;
      if (old.contracts) g.contracts = old.contracts;
      state.games[editing] = g;
    } else {
      if (fromBattle && pendingSummary) { g.summary = pendingSummary; g.contracts = pendingSummary.contracts; }
      state.games.push(g);
      applyScaleRule();
    }
    if (fromBattle) { state.battle = blankBattle(); renderBattle(); showTab('log'); }
    save(); closeGame(); renderGames(); renderStatus(); prunePhotos();
  });
  // Set (or correct) which game an unlock was bought after.
  const whenDlg = $('#when-dialog');
  let whenTarget = null;
  function openWhen(btn) {
    const idx = btn.dataset.whenIdx;
    const p = idx != null ? state.purchases[+idx] : { id: btn.dataset.whenId, afterGame: 0 };
    whenTarget = { idx: idx != null ? +idx : null, id: p.id };
    const s = SHIPS.find((x) => x.id === p.id), a = ALL_ADVS.find((x) => x.id === p.id);
    $('#when-name').textContent = (s || a).name;
    const sel = $('#when-select');
    sel.innerHTML = ['<option value="0">Before the first game</option>']
      .concat(state.games.map((g, i) => `<option value="${i + 1}">After game ${i + 1}${g.opp ? ' (vs ' + esc(g.opp) + ')' : ''}${g.date ? ' · ' + esc(g.date) : ''}</option>`)).join('');
    sel.value = String(p.afterGame || 0);
    whenDlg.showModal();
  }
  $('#when-save').addEventListener('click', () => {
    const n = num($('#when-select').value);
    state.purchases = state.purchases || [];
    if (whenTarget.idx != null) state.purchases[whenTarget.idx].afterGame = n;
    else state.purchases.push({ id: whenTarget.id, cost: unlockCost(whenTarget.id), afterGame: n, date: '' });
    whenDlg.close(); save(); renderGames();
  });
  $('#when-cancel').addEventListener('click', () => whenDlg.close());

  // Optional: raise the campaign scale after every N games played at the current scale.
  function applyScaleRule() {
    const n = num(state.scaleRule);
    const cur = num(state.campScale) || 3;
    if (!n || cur >= 10) return;
    const atScale = state.games.filter((x) => num(x.scale) === cur).length;
    if (atScale >= n) { state.campScale = String(cur + 1); renderBound(); }
  }

  function suggestRep() {
    if (repTouched) return;
    const won = form.elements.win.value === 'Win';
    const profit = num(form.elements.credits.value) > 0;
    form.elements.rep.value = (won ? 1 : 0) + (profit ? 1 : 0);
  }
  form.elements.rep.addEventListener('input', () => { repTouched = true; });
  form.elements.win.addEventListener('change', suggestRep);
  form.elements.credits.addEventListener('input', suggestRep);

  // ---------- ship cards ----------
  // A stat changed by an advantage shows the modified value in green; tapping it
  // switches to the printed value plus the change, e.g. "5" <-> "4 (+1)".
  const sgn = (d) => (d > 0 ? '+' : '−') + Math.abs(d);
  const modBtn = (shown, alt) => `<button type="button" class="mod" data-alt="${esc(alt)}" aria-label="${esc(shown)}, printed ${esc(alt)}. Tap to switch.">${esc(shown)}</button>`;
  const modVal = (val, base, unit) => (val !== base
    ? modBtn(val + (unit || ''), base + (unit || '') + ' (' + sgn(val - base) + ')') : `${val}${unit || ''}`);
  function rangeVal(range, base) {
    if (!base || range === base) return esc(range);
    const a = /(\d+)\D+(\d+)/.exec(range), b = /(\d+)\D+(\d+)/.exec(base);
    const dMin = a[1] - b[1], dMax = a[2] - b[2];
    const d = dMin === dMax ? sgn(dMax) : dMin === 0 ? sgn(dMax) + ' max' : sgn(dMin) + '/' + sgn(dMax);
    return modBtn(range, base + ' (' + d + ')');
  }
  document.addEventListener('click', (e) => {
    const m = e.target.closest('button.mod');
    if (!m) return;
    const now = m.textContent;
    m.textContent = m.dataset.alt;
    m.dataset.alt = now;
    m.classList.toggle('base');
  });

  function weaponRow(kind, w) {
    if (!w) return `<div class="wrow none"><span class="kind ${kind}">${kind}</span><span class="wn">None</span><span></span></div>`;
    const range = rangeVal(w.range, w.baseRange);
    return `<div class="wrow">
      <span class="kind ${kind}">${kind}</span>
      <span class="wn">${esc(w.name)}${w.note ? `<small>${esc(w.note)}</small>` : ''}</span>
      <span class="wv">${range} · <b>${esc(w.dice)}</b> · dmg ${modVal(w.dmg, w.baseDmg == null ? w.dmg : w.baseDmg)}</span>
    </div>`;
  }

  // Your advantages apply to your own (unlocked) ship classes.
  const campaignHas = (id) => !!state.unlocked[id];

  // ctx describes whose fleet: which classes they own and which advantages apply.
  const MY_FLEET = { owns: (s) => isOwned(s), has: (id) => !!state.unlocked[id], whose: 'your' };
  function rivalFleet(r) {
    const set = new Set(r.unlocked || []);
    return { owns: (s) => s.always || set.has(s.id), has: (id) => set.has(id), whose: 'their' };
  }

  function shipCard(s, ctx) {
    ctx = ctx || MY_FLEET;
    const owned = ctx.owns(s);
    const cls = s.mass === 0 ? 'Wing' : /Utility/.test(s.name) ? 'Utility ship' : /Carrier/.test(s.name) ? 'Carrier' : 'Warship';
    const tag = s.always ? '<span class="badge free">FREE</span>' : owned ? '<span class="badge own">OWNED</span>' : '';
    return `<article class="card ${owned ? '' : 'locked'}">
      <header>
        <div class="title">
          <h3>${esc(s.name)}${s.wz ? '<span class="badge wz">WZ</span>' : ''}${tag}</h3>
          <div class="cls">Mass ${s.mass} · ${cls}</div>
        </div>
        <div class="costtag"><b>${s.cost}</b><span>Credits</span></div>
      </header>
      ${shipBody(s, ctx)}
    </article>`;
  }

  function shipBody(s, ctx) {
    ctx = ctx || MY_FLEET;
    const owned = ctx.owns(s);
    const f = fleetStats(s, owned ? ctx.has : () => false);
    const advNames = [...f.applied].map((id) => ALL_ADVS.find((a) => a.id === id).name);
    return `<div class="stats">
        <div><b>${s.mass}</b><span>Mass</span></div>
        <div><b>${f.thrust == null ? '–' : modVal(f.thrust, s.thrust, '″')}</b><span>Thrust</span></div>
        <div><b>${modVal(f.sil, s.sil)}</b><span>Silhouette</span></div>
        <div><b>${modVal(f.shields, s.shields)}</b><span>Shields</span></div>
      </div>
      <div class="weap">${weaponRow('pri', f.pri)}${weaponRow('aux', f.aux)}</div>
      <div class="derived">
        <span>Jump range <b>${modVal(f.jump, 6 - s.mass, '″')}</b></span>
        <span>Mother’s wing <b>${s.mass ? modVal(f.wing, s.mass, '″') : '—'}</b></span>
        ${f.scan !== 3 ? `<span>Scan <b>${modVal(f.scan, 3, '″')}</b></span>` : ''}
        <span>Explodes <b>${f.explode ? 'D6 ≤ ' + modVal(f.explode, s.mass) : 'never'}</b></span>
        ${owned || s.always ? '' : `<span>Unlock <b>${s.cost} capital</b></span>`}
      </div>
      ${advNames.length ? `<p class="applied">Includes ${ctx.whose} advantages: ${advNames.map(esc).join(', ')}</p>` : ''}
      ${s.rules.length ? `<ul class="rules">${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}`;
  }

  function renderShips() {
    const mine = SHIPS.filter(isOwned);
    $('#cnt-mine').textContent = '(' + mine.length + ')';
    $('#cnt-all').textContent = '(' + SHIPS.length + ')';
    $$('[data-shipfilter]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.shipfilter === prefs.shipFilter)));
    const objects = prefs.shipFilter === 'objects';
    $('#objects-view').hidden = !objects;
    $$('[data-ships-only]').forEach((el) => { el.hidden = objects; });
    const rival = /^rival:/.test(prefs.shipFilter) && (state.rivals || {})[prefs.shipFilter.slice(6)];
    if (/^rival:/.test(prefs.shipFilter) && !rival) prefs.shipFilter = 'mine';
    const banner = $('#rival-banner');
    banner.hidden = !rival;
    $$('[data-ships-only]').forEach((el) => { if (rival && el.id === 'advs-owned') el.hidden = true; });
    if (rival) {
      const ctx = rivalFleet(rival);
      const advs = ALL_ADVS.filter((a) => ctx.has(a.id));
      banner.innerHTML = `<div><b>${esc(rival.corp || 'Unnamed corporation')}</b>’s fleet${rival.ceo ? ' · ' + esc(rival.ceo) : ''}
        <small>Shared ${esc((rival.sharedAt || '').slice(0, 10))} · Advantages: ${advs.length ? advs.map((a) => esc(a.name)).join(', ') : 'none'}</small></div>
        <button type="button" class="btn sm" data-shipfilter-set="mine">Back to my fleet</button>`;
      $('#ship-cards').innerHTML = SHIPS.filter(ctx.owns).map((s) => shipCard(s, ctx)).join('');
    } else {
      const list = objects ? [] : prefs.shipFilter === 'all' ? SHIPS : mine;
      $('#ship-cards').innerHTML = list.map((s) => shipCard(s)).join('');
    }
    if (objects) renderObjects();

    const advs = ALL_ADVS.filter((a) => state.unlocked[a.id]);
    $('#cnt-advs').textContent = '(' + advs.length + ')';
    const ownedList = $('#advs-owned-list');
    ownedList.innerHTML = advs.length
      ? advs.map((a) => `<div class="adv">
          <div class="adv-h"><div><span class="lvl">L${a.lvl}</span><b>${esc(a.name)}</b> <span class="tree-name">${esc(a.tree)}</span><small>${esc(a.desc)}</small></div>
          <button type="button" class="chevbtn" data-toggle-adv aria-expanded="false" aria-label="Full rules for ${esc(a.name)}">${CHEVRON}</button></div>
          ${advDetail(a)}</div>`).join('')
      : '<p class="none">No competitive advantages bought yet.</p>';
    $$('.adv-full', ownedList).forEach((el) => { el.hidden = true; });
  }
  // Independent ships and objects, with Ⓢ values worked out at a chosen scale.
  let objScale = null;
  function scaleText(str, n) {
    return String(str).replace(/Ⓢ\/3/g, Math.ceil(n / 3)).replace(/Ⓢ\/2/g, Math.ceil(n / 2)).replace(/Ⓢ/g, n)
      .replace(/\((\d+)\)D/g, '$1D');
  }
  function renderObjects() {
    const n = objScale || num(state.battle && state.battle.scale) || num(state.campScale) || 3;
    $('#obj-scale').textContent = n;
    $('#object-note').textContent = OBJECT_NOTE;
    $('#object-cards').innerHTML = OBJECTS.map((o) => `<article class="card obj">
      <header><div class="title"><h3>${esc(o.name)}</h3><div class="cls">${esc(o.kind)} · ${esc(o.from)}</div></div></header>
      <div class="stats">${['Mass', 'Move', 'Silhouette', 'Shields'].map((l, i) => `<div><b>${esc(scaleText(o.stats[i], n))}</b><span>${l}</span></div>`).join('')}</div>
      ${o.weapons ? `<div class="weap">${o.weapons.map((w) => weaponRow(w.kind, Object.assign({}, w, { dice: scaleText(w.dice, n) }))).join('')}</div>` : ''}
      <ul class="rules">${o.notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </article>`).join('');
  }
  $('#objects-view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-objscale]');
    if (!b) return;
    const cur = objScale || num(state.battle && state.battle.scale) || num(state.campScale) || 3;
    objScale = Math.min(10, Math.max(1, cur + num(b.dataset.objscale)));
    renderObjects();
  });

  $('#rival-banner').addEventListener('click', (e) => {
    if (e.target.closest('[data-shipfilter-set]')) { prefs.shipFilter = 'mine'; savePrefs(); renderShips(); }
  });

  $$('[data-shipfilter]').forEach((b) => b.addEventListener('click', () => {
    prefs.shipFilter = b.dataset.shipfilter; savePrefs(); renderShips();
  }));

  // ---------- battle (in-game tracker) ----------
  const B = () => state.battle;
  const shipById = (id) => SHIPS.find((s) => s.id === id);
  const STATUS = { in: 'In play', out: 'Jumped out', dead: 'Destroyed' };
  const NEXT_STATUS = { in: 'out', out: 'dead', dead: 'in' };

  function battleScale() { return B().scale || num(state.campScale) || 3; }
  function cmdTokens() { return battleScale() + 3 + (!B().nonCampaign && state.unlocked[TACTICAL_SAVANT_ID] ? 1 : 0); }
  function battleCredits() { return B().ledger.reduce((s, e) => s + e.amt, 0); }
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

  const helmOpen = new Set();
  const contractOpen = new Set();

  // Campaign advantages apply in campaign games only.
  const battleHas = (id) => !B().nonCampaign && !!state.unlocked[id];
  function effSil(s) { return fleetStats(s, battleHas).sil; }

  // Utility ship limit: Ⓢ ships, +1 Light Utility Ship with Industrial Might (FAQ: individual ships).
  function utilityCheck(extraShip, extraCount) {
    let utes = 0, light = 0;
    B().bgs.filter((g) => g.status === 'in').forEach((g) => {
      const n = shipById(g.ship).name;
      if (/Utility/.test(n)) utes += g.count;
      if (n === 'Light Utility Ship') light += g.count;
    });
    if (extraShip && /Utility/.test(extraShip.name)) {
      utes += extraCount;
      if (extraShip.name === 'Light Utility Ship') light += extraCount;
    }
    const might = battleHas('adv_47');
    const limit = battleScale() + (might && light > 0 ? 1 : 0);
    return { utes, limit, might, over: utes > limit };
  }

  // Replace scale symbols in contract stat cells with this game's numbers.
  function atScale(str) {
    const n = battleScale();
    return String(str).replace(/Ⓢ\/3/g, Math.ceil(n / 3)).replace(/Ⓢ\/2/g, Math.ceil(n / 2)).replace(/Ⓢ/g, n)
      .replace(/\((\d+)\)D/g, '$1D');
  }

  const ceos = () => B().ceos || 2;
  function ctState(id) {
    const b = B();
    b.ct = b.ct || {};
    return b.ct[id] || { left: battleScale(), ex: false };
  }
  function ctTrack(c) {
    const t = ctState(c.id);
    return `<div class="ct-track">
      <span class="ct-l">Cards left</span>
      <div class="stepper sm"><button type="button" data-ctleft="${esc(c.id)}" data-d="-1" aria-label="One fewer card">−</button><b>${t.left}</b><button type="button" data-ctleft="${esc(c.id)}" data-d="1" aria-label="One more card">+</button></div>
      <button type="button" class="ct-ex ${t.ex ? 'on' : ''}" data-ctex="${esc(c.id)}" aria-pressed="${t.ex}">${t.ex ? 'Exhausted' : 'Active'}</button>
    </div>`;
  }

  function contractCard(c) {
    const open = contractOpen.has(c.id);
    const n = battleScale();
    const list = (title, rows, marks) => rows && rows.length ? `<h4>${title}</h4><ul class="cl">${rows.map((r) => {
      const [mark, h, t] = marks ? r : ['»', r[0], r[1]];
      return `<li class="${mark === '▲' ? 'up' : mark === '▼' ? 'down' : ''}"><span class="mk">${mark}</span><span><b>${esc(h)}:</b> ${esc(t)}</span></li>`;
    }).join('')}</ul>` : '';
    const objs = c.objects ? `<table class="ctab"><thead><tr><th>Object</th><th>Mass</th><th>Move</th><th>Sil</th><th>Shields</th></tr></thead><tbody>
      ${c.objects.map((o) => `<tr><td>${esc(o[0])}</td>${o.slice(1).map((v) => `<td>${esc(atScale(v))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
    const weps = c.weapons ? `<table class="ctab"><thead><tr><th>Weapon</th><th>Range</th><th>Dice</th><th>Dmg</th></tr></thead><tbody>
      ${c.weapons.map((w) => `<tr><td>${esc(w.name)}</td><td>${esc(w.range)}</td><td>${esc(atScale(w.dice))}</td><td>${w.dmg}</td></tr>`).join('')}</tbody></table>` : '';
    return `<article class="contract suit-${'SHCD'['♠♥♣♦'.indexOf(c.suit)]} ${open ? 'open' : ''}" data-contract="${esc(c.id)}" role="button" tabindex="0" aria-expanded="${open}">
      <header>
        <span class="rank">${c.rank}<i>${c.suit}</i></span>
        <div class="ct"><b>${esc(c.name)}</b><small>${c.extraTable ? '+1 table · ' : ''}${esc(c.setup)}</small></div>
        <span class="chevbtn" aria-hidden="true">${CHEVRON}</span>
      </header>
      ${ctTrack(c)}
      <div class="expand-body" ${open ? '' : 'hidden'}>
        <p class="maxrev">Contract deck: ${n} card${n === 1 ? '' : 's'} · up to ${(n * (n + 1)) / 2 * ceos()} credits with ${ceos()} CEOs</p>
        <p class="scaleline">At Scale ${n}: Ⓢ = ${n} · Ⓢ/2 = ${Math.ceil(n / 2)} · Ⓢ/3 = ${Math.ceil(n / 3)}${c.usesMass ? ' · Ⓜ = Mass of the ship class' : ''}</p>
        <p><b>Contract deck:</b> ${esc(c.deck)} ${esc(SUIT_INFO[c.suit].deck)}</p>
        ${objs}${weps}
        ${(c.notes || []).map((t) => `<p class="cnote">${esc(t)}</p>`).join('')}
        ${list('Special', c.special)}${list('In play', c.inPlay)}${list('Timing', c.timing)}${list('Revenue', c.revenue, true)}
        <p class="hint small">Scan range 3″. Roll-off: D12, lowest wins. Rulebook ${esc(c.page)}.</p>
      </div>
    </article>`;
  }

  // +1/-1 damage token; destroys ships when damage reaches Silhouette (rulebook p.27).
  function damageBg(g, d) {
    const s = shipById(g.ship);
    const sil = effSil(s);
    if (d < 0) { g.msg = ''; g.dmg = Math.max(0, (g.dmg || 0) - 1); return; }
    if (g.count <= 0) return;
    g.dmg = (g.dmg || 0) + 1;
    let killed = 0;
    while (g.dmg >= sil && g.count > 0) { g.count--; g.dmg -= sil; killed++; }
    if (killed) {
      g.msg = killed + (killed > 1 ? ' ships' : ' ship') + ' destroyed.' +
        (s.mass > 0 ? ' Roll a D6 for each: on ' + s.mass + ' or less it explodes (' + s.mass + 'D6 damage-1 attacks within ' + s.mass + '″).' : '');
    }
    if (g.count === 0) { g.status = 'dead'; g.dmg = 0; }
  }

  function renderBattle() {
    const b = B();
    $('#b-round').textContent = b.round;
    $('#b-scale').textContent = battleScale();
    $('#b-noncamp').checked = !!b.nonCampaign;
    $('#btn-finish').textContent = b.nonCampaign ? 'End game' : 'Finish game → Log';

    // helm
    const total = cmdTokens();
    const assigned = b.helm.seize + b.helm.jump + b.helm.tac;
    const left = total - assigned;
    const tk = $('#b-tokens');
    tk.textContent = left === 0 ? total + ' tokens assigned' : left > 0 ? left + ' of ' + total + ' unassigned' : Math.abs(left) + ' over (' + total + ' max)';
    tk.classList.toggle('warn', left < 0);
    $('#b-helm').innerHTML = HELM_SLOTS.map((s) => {
      const n = b.helm[s.key];
      const spent = s.spendable ? Math.min(b.spent[s.key], n) : 0;
      const avail = n - spent;
      const pips = Array.from({ length: n }, (_, i) => (i < avail
        ? '<span class="pip"></span>'
        : `<button type="button" class="pip used" data-refill="${s.key}" aria-label="Refill a ${s.name} token"></button>`)).join('');
      const advNotes = HELM_ADVS[s.key].filter(battleHas).map((id) => {
        const a = ALL_ADVS.find((x) => x.id === id);
        return `<dt class="adv-note">Adv. ${esc(a.name)}</dt><dd>${esc(ADV_DETAILS[id][1])}</dd>`;
      }).join('');
      const sub = s.key === 'seize' ? `Initiative roll-off: <b>${seizeDie(n)}</b>` : `${n - spent} left`;
      const open = helmOpen.has(s.key);
      return `<div class="slot slot-${s.key} ${open ? 'open' : ''}">
        <div class="slot-h"><button type="button" class="slot-title" data-helminfo="${s.key}" aria-expanded="${open}">${s.name}${CHEVRON}</button><span>${sub}</span></div>
        <div class="slot-body">
          <div class="pips" ${s.spendable && n ? `data-spend="${s.key}" role="button" tabindex="0" aria-label="Spend a ${s.name} token"` : ''}>${pips || '<span class="nopip">No tokens</span>'}</div>
          <div class="stepper sm"><button type="button" data-helm="${s.key}" data-d="-1" aria-label="Remove token from ${s.name}">−</button><b>${n}</b><button type="button" data-helm="${s.key}" data-d="1" aria-label="Add token to ${s.name}">+</button></div>
        </div>
        ${s.help ? `<p class="slot-help">${s.help}</p>` : ''}
        <dl class="expand-body helm-info" ${open ? '' : 'hidden'}>${HELM_INFO[s.key].map(([h, t]) => `<dt>${esc(h)}</dt><dd>${esc(t)}</dd>`).join('')}${advNotes}</dl>
      </div>`;
    }).join('');

    // once-per-game / once-per-round advantages
    const uses = ONCE_PER.filter((u) => battleHas(u.id));
    $('#b-uses-wrap').hidden = !uses.length;
    $('#b-uses').innerHTML = uses.map((u) => {
      const used = !!(b.advUsed && b.advUsed[u.id]);
      const a = ALL_ADVS.find((x) => x.id === u.id);
      return `<button type="button" class="use ${used ? 'used' : ''}" data-use="${u.id}" aria-pressed="${used}">
        <span class="use-name">${esc(a.name)}<small>${esc(u.what)}</small></span>
        <span class="use-state">${used ? 'Used' : u.per === 'game' ? 'Once per game' : 'Once per round'}</span></button>`;
    }).join('');

    // credits
    const cr = battleCredits();
    $('#b-credits').textContent = signed(cr);
    $('#b-credits-state').textContent = cr > 0 ? 'Profit' : cr < 0 ? 'Deficit' : 'Break even';
    $('#b-credits-card').className = 'credits ' + (cr > 0 ? 'profit' : cr < 0 ? 'deficit' : '');

    // battlegroups
    const uc = utilityCheck();
    const util = $('#b-util');
    util.textContent = uc.utes ? 'Utility ships ' + uc.utes + '/' + uc.limit + (uc.limit > battleScale() ? ' (Industrial Might)' : '') : '';
    util.classList.toggle('warn', uc.over);
    $('#b-bgs').innerHTML = b.bgs.length ? b.bgs.map((g) => {
      const s = shipById(g.ship);
      const start = g.start || g.count, dmg = g.dmg || 0, sil = effSil(s);
      const lost = start - g.count;
      const ships = Array.from({ length: start }, (_, i) => `<span class="shippip ${i < g.count ? '' : 'lost'}"></span>`).join('');
      const crit = g.status === 'in' && g.count > 0 && dmg > s.mass;
      const canAct = g.status === 'in' && g.count > 0;
      const f = fleetStats(s, battleHas);
      return `<div class="bg st-${g.status} ${canAct && g.act ? 'acted' : ''}">
        <div class="bg-top">
          <div class="bg-main" ${canAct ? `data-bgact="${g.id}" role="button" tabindex="0" aria-pressed="${!!g.act}"` : ''}>
            <b>${esc(g.name || 'BG ' + g.id)}</b> · ${start}× ${esc(s.name)}
            <small>Round ${g.round} · ${start * s.cost} cr · Ⓜ${s.mass}</small>
            ${canAct ? `<span class="act-chip">${g.act ? '✓ Activated' : 'Tap to mark activated'}</span>` : ''}
          </div>
          <button type="button" class="status" data-bgstatus="${g.id}">${STATUS[g.status]}</button>
          <button type="button" class="x" data-bgdel="${g.id}" aria-label="Remove battlegroup">×</button>
        </div>
        <div class="bg-stats">
          <span>Thrust <b>${f.thrust == null ? '–' : f.thrust + '″'}</b></span><span>Sil <b>${f.sil}</b></span><span>Shields <b>${f.shields}</b></span><span>Jump <b>${f.jump}″</b></span>
          ${f.pri ? `<span class="w"><i class="kind pri">pri</i>${esc(f.pri.name)} ${esc(f.pri.range)} · <b>${esc(f.pri.dice)}</b> · dmg ${f.pri.dmg}</span>` : ''}
          ${f.aux ? `<span class="w"><i class="kind aux">aux</i>${esc(f.aux.name)} ${esc(f.aux.range)} · <b>${esc(f.aux.dice)}</b> · dmg ${f.aux.dmg}</span>` : ''}
        </div>
        <div class="bg-track">
          <div class="trk">
            <span class="trk-l">Ships <b>${g.count}/${start}</b>${lost ? ` <em>${lost} lost</em>` : ''}</span>
            <div class="trk-row"><div class="shippips">${ships}</div>
              <div class="stepper sm"><button type="button" data-bgships="${g.id}" data-d="-1" aria-label="Lose a ship">−</button><button type="button" data-bgships="${g.id}" data-d="1" aria-label="Restore a ship">+</button></div></div>
          </div>
          <div class="trk">
            <span class="trk-l">Damage <b>${dmg}</b>/${sil}${crit ? ' <em class="crit">Systems critical</em>' : ''}</span>
            <div class="trk-row"><div class="dmgbar"><span style="width:${Math.min(100, (dmg / sil) * 100)}%"></span></div>
              <div class="stepper sm"><button type="button" data-bgdmg="${g.id}" data-d="-1" aria-label="Remove damage">−</button><button type="button" data-bgdmg="${g.id}" data-d="1" aria-label="Add damage">+</button></div></div>
          </div>
          ${g.msg ? `<p class="bg-msg">${esc(g.msg)}</p>` : ''}
        </div>
      </div>`;
    }).join('') : '<p class="empty sm">No battlegroups requisitioned yet.</p>';

    // contracts
    const picked = (b.contracts || []).map((id) => CONTRACTS.find((c) => c.id === id)).filter(Boolean);
    const tables = 1 + picked.filter((c) => c.extraTable).length;
    $('#b-tables').textContent = picked.length ? tables + ' table' + (tables > 1 ? 's' : '') + ' · jump point limit ' + (tables + 1) : '';
    const exN = exhaustedCount();
    $('#b-endwarn').hidden = exN < 2;
    $('#b-ceos').textContent = ceos();
    $('#b-ceos-row').hidden = !picked.length;
    $('#btn-contracts').textContent = picked.length ? 'Change contracts (' + picked.length + ')' : 'Choose contracts';
    $('#b-contracts').innerHTML = picked.map(contractCard).join('');
    const last = [...state.games].reverse().find((g) => g.contracts && g.contracts.length);
    const same = $('#btn-same-contracts');
    same.hidden = b.nonCampaign || !last || (b.contracts || []).join() === last.contracts.join();
    if (last) same.textContent = 'Same contracts as last game (' + last.contracts.map((id) => CONTRACTS.find((c) => c.id === id).name).join(', ') + ')';

    // ledger, newest round first
    const rounds = [...new Set(b.ledger.map((e) => e.round))].sort((x, y) => y - x);
    $('#b-ledger').innerHTML = rounds.length ? rounds.map((r) => {
      const entries = b.ledger.map((e, i) => ({ e, i })).filter((x) => x.e.round === r);
      const net = entries.reduce((s, x) => s + x.e.amt, 0);
      return `<div class="round-block"><div class="round-h"><b>Round ${r}</b><span>${signed(net)}</span></div>
        ${entries.map(({ e, i }) => `<div class="entry"><span class="amt ${e.amt < 0 ? 'neg' : 'pos'}">${signed(e.amt)}</span><span class="what">${esc(e.note || (e.amt < 0 ? 'Spent' : 'Revenue'))}</span>${e.bg ? '' : `<button type="button" class="x" data-ledel="${i}" aria-label="Delete entry">×</button>`}</div>`).join('')}
      </div>`;
    }).join('') : '<p class="empty sm">Requisitions and revenue will show here, round by round.</p>';
  }

  function addLedger(amt, note, bg) {
    if (!amt) return;
    B().ledger.push({ round: B().round, amt, note: note || '', bg: bg || null });
    save(); renderBattle();
  }

  function toggleContract(card) {
    const k = card.dataset.contract;
    if (contractOpen.has(k)) contractOpen.delete(k); else contractOpen.add(k);
    renderBattle();
  }
  $('#b-contracts').addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-contract]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleContract(card); }
  });

  $('#view-battle').addEventListener('click', (e) => {
    const card = e.target.closest('[data-contract]');
    if (card && !e.target.closest('.ct-track')) { toggleContract(card); return; }
    const b = B();
    const refill = e.target.closest('[data-refill]');
    const spend = e.target.closest('[data-spend]');
    const act = e.target.closest('[data-bgact]');
    if (refill) {
      const k = refill.dataset.refill;
      b.spent[k] = Math.max(0, b.spent[k] - 1);
      save(); renderBattle(); return;
    }
    if (spend) {
      const k = spend.dataset.spend;
      b.spent[k] = Math.min(b.helm[k], b.spent[k] + 1);
      save(); renderBattle(); return;
    }
    if (act) {
      const g = b.bgs.find((x) => x.id === +act.dataset.bgact);
      g.act = !g.act;
      save(); renderBattle(); return;
    }
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.bstep === 'round') {
      if (num(t.dataset.d) > 0) { nextRound(); return; }
      b.round = Math.max(1, b.round - 1);
    } else if (t.dataset.bstep === 'scale') {
      b.scale = Math.min(10, Math.max(1, battleScale() + num(t.dataset.d)));
    } else if (t.dataset.helm) {
      const k = t.dataset.helm;
      b.helm[k] = Math.max(0, b.helm[k] + num(t.dataset.d));
      if (b.spent[k] > b.helm[k]) b.spent[k] = b.helm[k];
    } else if (t.dataset.earn) {
      addLedger(num(t.dataset.earn), ''); return;
    } else if (t.dataset.helminfo) {
      const k = t.dataset.helminfo;
      if (helmOpen.has(k)) helmOpen.delete(k); else helmOpen.add(k);
      renderBattle(); return;
    } else if (t.dataset.ctleft) {
      const id = t.dataset.ctleft, cur = ctState(id);
      cur.left = Math.max(0, cur.left + num(t.dataset.d));
      if (cur.left === 0) cur.ex = true;
      b.ct[id] = cur;
    } else if (t.dataset.ctex) {
      const id = t.dataset.ctex, cur = ctState(id);
      cur.ex = !cur.ex;
      b.ct[id] = cur;
    } else if (t.dataset.ceos) {
      b.ceos = Math.min(8, Math.max(2, ceos() + num(t.dataset.d)));
    } else if (t.dataset.use) {
      b.advUsed = b.advUsed || {};
      if (b.advUsed[t.dataset.use]) delete b.advUsed[t.dataset.use]; else b.advUsed[t.dataset.use] = true;
    } else if (t.dataset.bgdmg) {
      damageBg(b.bgs.find((x) => x.id === +t.dataset.bgdmg), num(t.dataset.d));
    } else if (t.dataset.bgships) {
      const g = b.bgs.find((x) => x.id === +t.dataset.bgships);
      const start = g.start || g.count;
      g.count = Math.min(start, Math.max(0, g.count + num(t.dataset.d)));
      g.msg = '';
      if (g.count === 0) { g.status = 'dead'; g.dmg = 0; } else if (g.status === 'dead') g.status = 'in';
    } else if (t.dataset.bgstatus) {
      const g = b.bgs.find((x) => x.id === +t.dataset.bgstatus);
      g.status = NEXT_STATUS[g.status];
    } else if (t.dataset.bgdel) {
      const id = +t.dataset.bgdel;
      const g = b.bgs.find((x) => x.id === id);
      if (!confirm('Remove ' + (g.name || 'BG ' + g.id) + '? This also refunds its requisition cost (use it to undo a mistake).')) return;
      b.bgs = b.bgs.filter((x) => x.id !== id);
      b.ledger = b.ledger.filter((x) => x.bg !== id);
    } else if (t.dataset.ledel) {
      b.ledger.splice(+t.dataset.ledel, 1);
    } else return;
    save(); renderBattle();
  });

  $('#view-battle').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-spend], [data-bgact]')) {
      e.preventDefault(); e.target.click();
    }
  });

  // Next round. If battlegroups aren't marked activated, ask first (Continue / Cancel) but never forbid it.
  const roundDlg = $('#round-dialog');
  function nextRound() {
    if (exhaustedCount() >= 2) {
      $('#end-round').textContent = B().round;
      endDlg.showModal();
      return;
    }
    nextRoundChecks();
  }
  function nextRoundChecks() {
    const unacted = B().bgs.filter((g) => g.status === 'in' && g.count > 0 && !g.act);
    if (!unacted.length) { startNextRound(); return; }
    $('#round-dlg-list').textContent = unacted.map((g) => (g.name || 'BG ' + g.id) + ' (' + shipById(g.ship).name + ')').join(', ');
    roundDlg.showModal();
  }
  // End Phase: clear all CMD tokens and activations, then start the next round at the top of the tab.
  function startNextRound() {
    const b = B();
    b.round += 1;
    b.helm = { seize: 0, jump: 0, tac: 0 };
    b.spent = { jump: 0, tac: 0 };
    b.bgs.forEach((g) => { g.act = false; g.msg = ''; });
    ONCE_PER.filter((u) => u.per === 'round').forEach((u) => { if (b.advUsed) delete b.advUsed[u.id]; });
    save(); renderBattle();
    // After the dialog returns focus to the Next round button, jump back to the top of the tab.
    if (document.activeElement) document.activeElement.blur();
    setTimeout(() => window.scrollTo(0, 0), 0);
    const tile = $('#b-round').closest('.tile');
    tile.classList.remove('flash'); void tile.offsetWidth; tile.classList.add('flash');
  }
  $('#round-continue').addEventListener('click', () => { roundDlg.close(); startNextRound(); });
  $('#round-cancel').addEventListener('click', () => roundDlg.close());
  $('#btn-next-round').addEventListener('click', nextRound);

  $('#b-earn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    addLedger(Math.round(num(f.amt.value)), f.note.value.trim());
    f.reset();
  });

  // requisition dialog
  const reqDlg = $('#req-dialog');
  const reqForm = $('#req-form');
  let reqCount = 1;
  function renderReq() {
    const s = shipById(reqForm.ship.value);
    const cost = s.cost * reqCount;
    $('#req-count').textContent = reqCount;
    $('#req-cost').textContent = cost;
    $('#req-after').textContent = '(credits after: ' + signed(battleCredits() - cost) + ')';
    const uc = utilityCheck(s, reqCount);
    $('#req-warn').textContent = uc.over ? 'Over the utility ship limit: ' + uc.utes + ' of ' + uc.limit + ' allowed in play.' : '';
  }
  $('#btn-req').addEventListener('click', () => {
    const ships = B().nonCampaign ? SHIPS : SHIPS.filter(isOwned);
    reqForm.ship.innerHTML = ships.map((s) => `<option value="${s.id}">${esc(s.name)} — ${s.cost} cr each</option>`).join('');
    reqCount = 1; reqForm.name.value = '';
    renderReq();
    reqDlg.showModal();
  });
  reqForm.ship.addEventListener('change', renderReq);
  reqForm.addEventListener('click', (e) => {
    const d = e.target.dataset && e.target.dataset.rstep;
    if (!d) return;
    reqCount = Math.min(MAX_BATTLEGROUP_SIZE, Math.max(1, reqCount + num(d)));
    renderReq();
  });
  $('#btn-req-cancel').addEventListener('click', () => reqDlg.close());
  reqForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const b = B();
    const s = shipById(reqForm.ship.value);
    const id = b.nextBg++;
    const name = reqForm.name.value.trim();
    b.bgs.push({ id, ship: s.id, count: reqCount, start: reqCount, dmg: 0, round: b.round, name, status: 'in' });
    reqDlg.close();
    addLedger(-s.cost * reqCount, 'Requisition ' + (name || 'BG ' + id) + ': ' + reqCount + '× ' + s.name, id);
  });

  const ctDlg = $('#contract-dialog');
  $('#btn-contracts').addEventListener('click', () => {
    const sel = new Set(B().contracts || []);
    $('#contract-picks').innerHTML = Object.keys(SUIT_INFO).map((suit) => `
      <div class="pick-suit"><h4>${suit} ${SUIT_INFO[suit].name}</h4>
        ${CONTRACTS.filter((c) => c.suit === suit).map((c) => `<label class="pick">
          <input type="checkbox" value="${esc(c.id)}" ${sel.has(c.id) ? 'checked' : ''}>
          <span><b>${c.rank}${c.suit}</b> ${esc(c.name)}${c.extraTable ? ' <small>+1 table</small>' : ''}</span></label>`).join('')}
      </div>`).join('');
    ctDlg.showModal();
  });
  $('#btn-same-contracts').addEventListener('click', () => {
    const last = [...state.games].reverse().find((g) => g.contracts && g.contracts.length);
    if (!last) return;
    B().contracts = last.contracts.slice();
    save(); renderBattle();
  });

  // Rulebook method: shuffle the twelve picture cards and reveal until three different suits appear.
  $('#btn-draw-contracts').addEventListener('click', () => {
    const deck = CONTRACTS.slice();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const picked = [];
    for (const c of deck) {
      if (!picked.some((p) => p.suit === c.suit)) picked.push(c);
      if (picked.length === 3) break;
    }
    B().contracts = picked.map((c) => c.id);
    save(); renderBattle();
    $$('#contract-picks input').forEach((i) => { i.checked = B().contracts.includes(i.value); });
  });
  $('#contract-picks').addEventListener('change', () => {
    B().contracts = $$('#contract-picks input:checked').map((i) => i.value);
    save(); renderBattle();
  });

  $('#b-noncamp').addEventListener('change', (e) => {
    B().nonCampaign = e.target.checked; save(); renderBattle();
  });
  $('#btn-finish').addEventListener('click', () => {
    const b = B();
    if (b.nonCampaign) {
      if (!confirm('End this non-campaign game and clear the Battle tab?')) return;
      state.battle = blankBattle(); save(); renderBattle(); return;
    }
    pendingSummary = buildSummary();
    $('#summary-body').innerHTML = summaryHtml(pendingSummary);
    $('#summary-dialog').showModal();
  });
  $('#summary-back').addEventListener('click', () => { pendingSummary = null; $('#summary-dialog').close(); });
  $('#summary-log').addEventListener('click', () => {
    const s = pendingSummary;
    $('#summary-dialog').close();
    openGame(-1, { scale: s.scale, credits: String(s.credits), notes: s.rounds + ' rounds.' });
  });

  // Snapshot of the finished battle, stored with the logged game.
  function buildSummary() {
    const b = B();
    const rounds = [];
    let total = 0;
    for (let r = 1; r <= b.round; r++) {
      const es = b.ledger.filter((e) => e.round === r);
      const earned = es.filter((e) => e.amt > 0).reduce((t, e) => t + e.amt, 0);
      const spent = es.filter((e) => e.amt < 0).reduce((t, e) => t - e.amt, 0);
      total += earned - spent;
      rounds.push({ round: r, earned, spent, total });
    }
    const fleet = b.bgs.map((g) => {
      const s = shipById(g.ship), start = g.start || g.count;
      return { name: g.name || 'BG ' + g.id, ship: s.name, count: start, lost: start - g.count, cost: start * s.cost, round: g.round, status: g.status };
    });
    return {
      scale: battleScale(), rounds: b.round, credits: battleCredits(),
      earned: rounds.reduce((t, r) => t + r.earned, 0), spent: rounds.reduce((t, r) => t + r.spent, 0),
      byRound: rounds, fleet, contracts: (b.contracts || []).slice(),
    };
  }

  function summaryHtml(s) {
    const max = Math.max(1, ...s.byRound.map((r) => Math.max(r.earned, r.spent)));
    const bar = (v, cls) => `<span class="bar ${cls}" style="width:${(v / max) * 100}%"></span>`;
    const shipsBought = s.fleet.reduce((t, g) => t + g.count, 0), shipsLost = s.fleet.reduce((t, g) => t + g.lost, 0);
    return `<div class="sum">
      <div class="sum-head ${s.credits > 0 ? 'profit' : s.credits < 0 ? 'deficit' : ''}">
        <b>${signed(s.credits)}</b><span>${s.credits > 0 ? 'Profit' : s.credits < 0 ? 'Deficit' : 'Break even'} · ${s.rounds} round${s.rounds === 1 ? '' : 's'} · Scale ${s.scale}</span></div>
      <div class="sum-tiles"><div><b class="pos">+${s.earned}</b><span>Revenue</span></div><div><b class="neg">−${s.spent}</b><span>Spent</span></div>
        <div><b>${shipsBought}</b><span>Ships bought</span></div><div><b class="${shipsLost ? 'neg' : ''}">${shipsLost}</b><span>Ships lost</span></div></div>
      ${s.contracts && s.contracts.length ? `<p class="sum-contracts">Contracts: ${s.contracts.map((id) => { const c = CONTRACTS.find((x) => x.id === id); return c.rank + c.suit + ' ' + esc(c.name); }).join(' · ')}</p>` : ''}
      <h4>Credits by round</h4>
      <div class="rounds">${s.byRound.map((r) => `<div class="rrow"><span class="rl">R${r.round}</span>
        <div class="rbars">${bar(r.earned, 'earn')}${bar(r.spent, 'spend')}</div>
        <span class="rv"><span class="pos">+${r.earned}</span> <span class="neg">−${r.spent}</span> = <b>${signed(r.total)}</b></span></div>`).join('')}</div>
      ${s.fleet.length ? `<h4>Fleet</h4><table class="ctab"><thead><tr><th>Battlegroup</th><th>Rd</th><th>Cost</th><th>Lost</th></tr></thead><tbody>
        ${s.fleet.map((g) => `<tr><td>${esc(g.name)} · ${g.count}× ${esc(g.ship)}</td><td>${g.round}</td><td>${g.cost}</td><td class="${g.lost ? 'neg' : ''}">${g.lost}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>`;
  }
  $('#btn-discard').addEventListener('click', () => {
    if (!confirm('Discard this game’s round, helm, battlegroups and credits?')) return;
    state.battle = blankBattle(); save(); renderBattle();
  });

  // ---------- tabs ----------
  function showTab(tab) {
    prefs.tab = tab; savePrefs();
    $$('.view').forEach((v) => { v.hidden = v.dataset.view !== tab; });
    $$('.tabbar button').forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    updateWakeLock();
  }
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#hdr-rep').addEventListener('click', () => showTab('log'));

  // ---------- backup ----------
  function setStatus(msg, err) {
    const el = $('#more-status');
    el.textContent = msg; el.classList.toggle('err', !!err);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function safeName() {
    return (state.corp || 'ABillionSuns').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'ABillionSuns';
  }
  function replaceState(next) {
    state = Object.assign(blankState(), next);
    movePurchaseText(state.games);
    addHouseRules(state);
    state.unlocked = state.unlocked || {};
    state.games = Array.isArray(state.games) ? state.games : [];
    store(STORE_KEY, state);
    renderAll();
  }

  $('#btn-export').addEventListener('click', async () => {
    let photoData = {};
    try { photoData = await exportPhotos(); } catch (err) { /* photos unavailable */ }
    download(safeName() + '_ABS_Campaign.json', JSON.stringify(Object.assign({}, state, { photoData }), null, 2), 'application/json');
    const np = Object.keys(photoData).length;
    setStatus('Backup downloaded' + (np ? ' (with ' + np + ' photo' + (np === 1 ? '' : 's') + ').' : '.'));
  });
  $('#btn-import').addEventListener('click', () => $('#file-json').click());
  $('#btn-import-html').addEventListener('click', () => $('#file-html').click());

  $('#file-json').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data && data.type === SHARE_TYPE) { addRivals([data]); setStatus('That was a rival’s shared corporation, so it was added to Rivals.'); return; }
      if (typeof data !== 'object' || !data || !('unlocked' in data)) throw new Error('not a backup');
      if (!confirm('Replace the current campaign with "' + f.name + '"?')) return;
      if (data.photoData) { try { await importPhotos(data.photoData); } catch (err) { /* skip photos */ } }
      delete data.photoData;
      replaceState(data);
      setStatus('Imported ' + f.name + '.');
    } catch (err) { setStatus('That file isn’t an ABS Companion backup.', true); }
  });

  // Import a filled-in copy of ABS_Campaign_Tracker.html ("Save a copy" bakes values into attributes).
  $('#file-html').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const doc = new DOMParser().parseFromString(await f.text(), 'text/html');
      if (!doc.getElementById('corp_name') || !doc.getElementById('log_61')) throw new Error('not a tracker');
      const val = (id) => { const el = doc.getElementById(id); return el ? (el.getAttribute('value') || el.textContent || '').trim() : ''; };
      const chk = (id) => { const el = doc.getElementById(id); return !!(el && el.hasAttribute('checked')); };
      const next = blankState();
      next.corp = val('corp_name'); next.ceo = val('ceo_name'); next.startDate = val('start_date');
      next.campScale = val('camp_scale'); next.totalRep = val('total_rep');
      next.summary = { finalScale: val('final_scale'), finalRep: val('final_rep'), finalCapital: val('final_capital'), winner: val('campaign_winner') };
      next.notes = val('additional_notes');
      SHIPS.forEach((s) => { if (!s.always && chk(s.id)) next.unlocked[s.id] = true; });
      ALL_ADVS.forEach((a) => { if (chk(a.id)) next.unlocked[a.id] = true; });
      for (let r = 0; r < 18; r++) {
        const b = 61 + r * 9;
        const g = { scale: val('log_' + b), opp: val('log_' + (b + 1)), win: normWin(val('log_' + (b + 2))),
          credits: val('log_' + (b + 3)), rep: val('log_' + (b + 4)), boughtRep: chk('log_' + (b + 5)),
          purchases: val('log_' + (b + 6)), date: val('log_' + (b + 7)), notes: val('log_' + (b + 8)) };   // purchases text moves to notes below
        const any = Object.keys(g).some((k) => g[k]);
        if (any) next.games.push(g);
      }
      if (!confirm('Replace the current campaign with the tracker "' + f.name + '"?')) return;
      replaceState(next);
      setStatus('Imported tracker ' + f.name + ' (' + next.games.length + ' games).');
    } catch (err) { setStatus('That file doesn’t look like a saved ABS Campaign Tracker.', true); }
  });
  function normWin(v) {
    if (/^(y|yes|w|win|won)$/i.test(v)) return 'Win';
    if (/^(n|no|l|loss|lost)$/i.test(v)) return 'Loss';
    if (/^(d|draw|tie)$/i.test(v)) return 'Draw';
    return v;
  }

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Clear the whole campaign on this device? Export a backup first if you want to keep it.')) return;
    replaceState(blankState());
    prunePhotos();
    setStatus('Campaign reset.');
  });

  // ---------- rivals (shared corporation files) ----------
  const SHARE_TYPE = 'abs-companion-corp';
  function sharePayload() {
    const c = capital();
    return {
      type: SHARE_TYPE, version: 1, sharedAt: new Date().toISOString(), app: APP_VERSION,
      corpId: state.corpId, corp: state.corp, ceo: state.ceo, rep: reputation(), campScale: state.campScale,
      capital: { total: c.total, avail: c.avail }, unlocked: Object.keys(state.unlocked),
      games: state.games.map((g) => ({ scale: g.scale, opp: g.opp, win: g.win, credits: g.credits, rep: g.rep, boughtRep: !!g.boughtRep, date: g.date })),
      purchases: state.purchases || [],
    };
  }
  function rivalStatus(msg, err) { const el = $('#rival-status'); el.textContent = msg; el.classList.toggle('err', !!err); }

  $('#btn-share-corp').addEventListener('click', async () => {
    const name = safeName() + '_ABS_share.json';
    const file = new File([JSON.stringify(sharePayload())], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: (state.corp || 'My corporation') + ' — A Billion Suns' });
        rivalStatus('Shared. Your rivals can add it with “Add rival from file”.');
        return;
      }
    } catch (err) { if (err && err.name === 'AbortError') return; }
    download(name, JSON.stringify(sharePayload()), 'application/json');
    rivalStatus('Saved ' + name + '. Send it to your rivals.');
  });

  $('#btn-add-rival').addEventListener('click', () => $('#file-rival').click());
  $('#file-rival').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    const ok = [];
    for (const f of files) {
      try { const d = JSON.parse(await f.text()); if (d && d.type === SHARE_TYPE) ok.push(d); } catch (err) { /* skip */ }
    }
    if (!ok.length) { rivalStatus('That isn’t a shared corporation file. Ask your rival to use “Share my corporation”.', true); return; }
    addRivals(ok);
  });

  function addRivals(list) {
    state.rivals = state.rivals || {};
    const names = [];
    let own = false;
    list.forEach((d) => {
      if (d.corpId === state.corpId) { own = true; return; }
      const id = d.corpId || newId();
      const prev = state.rivals[id];
      if (prev && prev.sharedAt > d.sharedAt) return;   // keep the newer copy
      state.rivals[id] = Object.assign({}, d, { corpId: id, importedAt: new Date().toISOString() });
      names.push((prev ? 'Updated ' : 'Added ') + (d.corp || 'Unnamed corporation'));
    });
    save(); renderStandings();
    rivalStatus(names.length ? names.join(', ') + '.' : own ? 'That’s your own corporation.' : 'Nothing new in that file.', !names.length);
  }

  const rivalOpen = new Set();
  function renderStandings() {
    const c = capital();
    const me = { corpId: state.corpId, corp: state.corp, ceo: state.ceo, rep: reputation(), games: state.games, capital: { total: c.total }, me: true };
    const rivals = Object.values(state.rivals || {});
    const rows = [me].concat(rivals).sort((a, b) => (b.rep || 0) - (a.rep || 0) || (b.capital?.total || 0) - (a.capital?.total || 0));
    if (!rivals.length) { $('#standings').innerHTML = ''; return; }
    const nameOf = (id) => (SHIPS.find((x) => x.id === id) || ALL_ADVS.find((a) => a.id === id) || {}).name;
    $('#standings').innerHTML = `<div class="list standings">${rows.map((r, i) => {
      const open = rivalOpen.has(r.corpId);
      const ships = r.me ? [] : SHIPS.filter((s) => s.always || (r.unlocked || []).includes(s.id)).map((s) => s.name);
      const advs = r.me ? [] : ALL_ADVS.filter((a) => (r.unlocked || []).includes(a.id)).map((a) => 'L' + a.lvl + ' ' + a.name);
      const games = (r.games || []);
      const wins = games.filter((g) => g.win === 'Win').length;
      return `<div class="item-wrap standing ${r.me ? 'me' : ''} ${open ? 'open' : ''}">
        <div class="item">
          <span class="rank-n">${i + 1}</span>
          <span class="name">${esc(r.corp || 'Unnamed corporation')}${r.me ? ' <span class="badge own">YOU</span>' : r.online ? ' <span class="badge online">ONLINE</span>' : ''}
            <small>${r.ceo ? esc(r.ceo) + ' · ' : ''}${games.length} game${games.length === 1 ? '' : 's'} · ${wins} win${wins === 1 ? '' : 's'} · ${r.capital ? r.capital.total : 0} capital earned</small></span>
          <span class="rep-n">${r.rep || 0}<small>rep</small></span>
          ${r.me ? '<span class="chev-spacer"></span>' : `<button type="button" class="chevbtn" data-rival="${esc(r.corpId)}" aria-expanded="${open}" aria-label="Details for ${esc(r.corp || 'rival')}">${CHEVRON}</button>`}
        </div>
        ${r.me ? '' : `<div class="expand-body rival-body" ${open ? '' : 'hidden'}>
          <p class="hint small">${r.online ? 'From the online campaign · updated ' + esc((r.sharedAt || '').slice(0, 10)) : 'Shared ' + esc((r.sharedAt || '').slice(0, 10)) + '. Ask them to share again for the latest.'}</p>
          <p><b>Ship classes:</b> ${ships.map(esc).join(', ')}</p>
          <p><b>Advantages:</b> ${advs.length ? advs.map(esc).join(', ') : 'none'}</p>
          ${games.length ? `<p><b>Recent games:</b> ${games.slice(-3).reverse().map((g) => [g.opp ? 'vs ' + g.opp : '', g.win, g.credits !== '' && g.credits != null ? g.credits + ' cr' : ''].filter(Boolean).map(esc).join(' ')).join(' · ')}</p>` : ''}
          <div class="btns two"><button type="button" class="btn" data-rival-fleet="${esc(r.corpId)}">View their fleet stats</button>
            ${r.online ? '' : `<button type="button" class="btn danger" data-rival-del="${esc(r.corpId)}">Remove</button>`}</div>
        </div>`}
      </div>`;
    }).join('')}</div>`;
  }
  $('#standings').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.rival) {
      const k = t.dataset.rival;
      if (rivalOpen.has(k)) rivalOpen.delete(k); else rivalOpen.add(k);
      renderStandings();
    } else if (t.dataset.rivalFleet) {
      prefs.shipFilter = 'rival:' + t.dataset.rivalFleet; savePrefs();
      renderShips(); showTab('stats');
    } else if (t.dataset.rivalDel) {
      const r = state.rivals[t.dataset.rivalDel];
      if (!confirm('Remove ' + (r.corp || 'this rival') + ' from your rivals?')) return;
      delete state.rivals[t.dataset.rivalDel];
      save(); renderStandings(); renderShips();
    }
  });

  // ---------- keep the screen awake during a game ----------
  let wakeLock = null;
  function battleInProgress() {
    const b = B();
    return b.round > 1 || b.bgs.length > 0 || b.ledger.length > 0 || (b.contracts || []).length > 0;
  }
  function updateWakeLock() {
    const want = prefs.keepAwake !== false && document.visibilityState === 'visible' &&
      (prefs.tab === 'battle' || battleInProgress());
    if (!('wakeLock' in navigator)) return;
    if (want && !wakeLock) {
      navigator.wakeLock.request('screen').then((l) => {
        wakeLock = l;
        l.addEventListener('release', () => { wakeLock = null; });
      }).catch(() => {});
    } else if (!want && wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }
  document.addEventListener('visibilitychange', updateWakeLock);
  $('#opt-awake').checked = prefs.keepAwake !== false;
  $('#opt-awake').addEventListener('change', (e) => { prefs.keepAwake = e.target.checked; savePrefs(); updateWakeLock(); });
  if (!('wakeLock' in navigator)) $('#awake-note').textContent = 'Not supported by this browser; set your phone’s auto-lock instead.';

  // ---------- game end check (two or more contracts exhausted at the end of a round) ----------
  const endDlg = $('#end-dialog');
  function exhaustedCount() {
    const ct = B().ct || {};
    return (B().contracts || []).filter((id) => ct[id] && ct[id].ex).length;
  }
  $('#end-keep').addEventListener('click', () => { endDlg.close(); nextRoundChecks(); });
  $('#end-finish').addEventListener('click', () => { endDlg.close(); $('#btn-finish').click(); });

  // ---------- rules lookup ----------
  const rulesDlg = $('#rules-dialog');
  function renderRules() {
    const q = $('#rules-search').value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const hits = GLOSSARY.filter((g) => {
      const hay = (g.t + ' ' + g.k + ' ' + g.d).toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    $('#rules-list').innerHTML = hits.length ? hits.map((g) => `<div class="rule-item">
        <div class="rule-h"><b>${esc(g.t)}</b><span>p.${g.p}</span></div>
        <p>${esc(g.d)}</p></div>`).join('')
      : '<p class="none">No matches. Try another word, or check the rulebook index.</p>';
  }
  $('#btn-rules').addEventListener('click', () => {
    $('#rules-search').value = '';
    renderRules();
    rulesDlg.showModal();
  });
  $('#rules-search').addEventListener('input', renderRules);
  $('#rules-close').addEventListener('click', () => rulesDlg.close());
  $('#rules-note').textContent = GLOSSARY_NOTE;

  // ---------- campaign stats ----------
  function renderCampaignStats() {
    const games = state.games;
    const boxes = [$('#campaign-stats'), $('#campaign-stats-ov')];
    $('#stats-wrap').hidden = !games.length;
    $('#stats-wrap-ov').hidden = !games.length;
    const box = { set innerHTML(h) { boxes.forEach((b) => { b.innerHTML = h; }); } };
    if (!games.length) { box.innerHTML = ''; return; }
    const res = (w) => games.filter((g) => g.win === w).length;
    const wins = res('Win'), losses = res('Loss'), draws = res('Draw');
    const withCredits = games.filter((g) => g.credits !== '' && g.credits != null && !isNaN(parseFloat(g.credits)));
    const avgCr = withCredits.length ? withCredits.reduce((t, g) => t + num(g.credits), 0) / withCredits.length : null;
    const profits = withCredits.filter((g) => num(g.credits) > 0).length;
    const c = capital();
    const unlockSpend = c.spent - games.filter((g) => g.boughtRep).length * REP_PURCHASE_COST;
    const repSpend = games.filter((g) => g.boughtRep).length * REP_PURCHASE_COST;

    // per-game credits and running reputation
    let rep = 0;
    const per = games.map((g, i) => { rep += num(g.rep) + (g.boughtRep ? 1 : 0); return { n: i + 1, cr: num(g.credits), hasCr: g.credits !== '' && g.credits != null, rep }; });
    const maxCr = Math.max(1, ...per.map((p) => Math.abs(p.cr)));

    // ship classes bought and lost (from saved game summaries)
    const byClass = {};
    games.forEach((g) => (g.summary ? g.summary.fleet : []).forEach((f) => {
      const k = byClass[f.ship] = byClass[f.ship] || { bought: 0, lost: 0, spent: 0 };
      k.bought += f.count; k.lost += f.lost; k.spent += f.cost;
    }));
    const classes = Object.entries(byClass).sort((a, b) => b[1].bought - a[1].bought);
    const summarized = games.filter((g) => g.summary).length;

    box.innerHTML = `
      <div class="sum-tiles stats4">
        <div><b>${games.length}</b><span>Games</span></div>
        <div><b>${wins}–${losses}${draws ? '–' + draws : ''}</b><span>W–L${draws ? '–D' : ''}</span></div>
        <div><b>${Math.round((wins / games.length) * 100)}%</b><span>Win rate</span></div>
        <div><b>${avgCr == null ? '–' : signed(Math.round(avgCr * 10) / 10)}</b><span>Avg credits</span></div>
      </div>
      <div class="sum-tiles stats4">
        <div><b>${profits}/${withCredits.length}</b><span>In profit</span></div>
        <div><b>${reputation()}</b><span>Reputation</span></div>
        <div><b>${c.total}</b><span>Capital earned</span></div>
        <div><b>${unlockSpend}${repSpend ? '+' + repSpend : ''}</b><span>Spent${repSpend ? ' (+rep)' : ''}</span></div>
      </div>
      <h4>Final credits by game</h4>
      <div class="gbars">${per.map((p) => `<div class="gbar" title="Game ${p.n}">
        <div class="gcol"><span class="${p.cr >= 0 ? 'up' : 'down'}" style="height:${p.hasCr ? Math.max(4, (Math.abs(p.cr) / maxCr) * 100) : 0}%"></span></div>
        <b class="${p.cr > 0 ? 'pos' : p.cr < 0 ? 'neg' : ''}">${p.hasCr ? signed(p.cr) : '–'}</b><small>G${p.n}</small></div>`).join('')}</div>
      <h4>Reputation over the campaign</h4>
      <div class="repline">${per.map((p) => `<span><b>${p.rep}</b><small>G${p.n}</small></span>`).join('<i>›</i>')}</div>
      ${classes.length ? `<h4>Ships requisitioned (${summarized} game${summarized === 1 ? '' : 's'} with summaries)</h4>
        <table class="ctab"><thead><tr><th>Class</th><th>Bought</th><th>Lost</th><th>Credits</th></tr></thead><tbody>
        ${classes.map(([n, k]) => `<tr><td>${esc(n)}</td><td>${k.bought}</td><td class="${k.lost ? 'neg' : ''}">${k.lost}</td><td>${k.spent}</td></tr>`).join('')}</tbody></table>`
        : '<p class="hint small">Finish games from the Battle tab to see which ships you requisition and lose.</p>'}`;
  }

  // ---------- photos (stored on this device in IndexedDB) ----------
  const PHOTO_DB = 'abs-companion-photos';
  function photoDb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(PHOTO_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function photoTx(mode, fn) {
    const db = await photoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  const getPhoto = (id) => photoTx('readonly', (s) => s.get(id));
  const putPhoto = (id, blob) => photoTx('readwrite', (s) => s.put(blob, id));
  const delPhoto = (id) => photoTx('readwrite', (s) => s.delete(id));
  const allPhotoKeys = () => photoTx('readonly', (s) => s.getAllKeys());

  // Shrink to at most 1600px on the long side as JPEG, so dozens of photos fit comfortably.
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  const thumbUrls = {};
  async function photoUrl(id) {
    if (thumbUrls[id]) return thumbUrls[id];
    const blob = await getPhoto(id).catch(() => null);
    if (!blob) return null;
    return (thumbUrls[id] = URL.createObjectURL(blob));
  }
  // Fill any <img data-photo> placeholders in a container.
  function loadThumbs(root) {
    $$('img[data-photo]', root).forEach(async (img) => {
      const u = await photoUrl(img.dataset.photo);
      if (u) img.src = u; else img.closest('.thumb').classList.add('missing');
    });
  }

  let dialogPhotos = [];
  function renderDialogPhotos() {
    const box = $('#game-photos');
    box.innerHTML = dialogPhotos.map((id) => `<span class="thumb"><img data-photo="${id}" alt="Game photo">
      <button type="button" class="x" data-photo-del="${id}" aria-label="Remove photo">×</button></span>`).join('');
    loadThumbs(box);
  }
  $('#btn-add-photo').addEventListener('click', () => $('#file-photo').click());
  $('#file-photo').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) {
      try {
        const blob = await shrinkImage(f);
        const id = 'p' + newId();
        await putPhoto(id, blob);
        dialogPhotos.push(id);
      } catch (err) { alert('Couldn’t add that photo.'); }
    }
    renderDialogPhotos();
  });
  $('#game-photos').addEventListener('click', (e) => {
    const d = e.target.closest('[data-photo-del]');
    if (d) { dialogPhotos = dialogPhotos.filter((x) => x !== d.dataset.photoDel); renderDialogPhotos(); }
  });

  const viewDlg = $('#photo-dialog');
  $('#game-list').addEventListener('click', async (e) => {
    const t = e.target.closest('.game-thumbs img');
    if (!t) return;
    e.stopPropagation();
    $('#photo-full').src = (await photoUrl(t.dataset.photo)) || '';
    viewDlg.showModal();
  }, true);
  $('#photo-close').addEventListener('click', () => viewDlg.close());

  // Remove photos no game refers to any more (deleted games, removed photos).
  async function prunePhotos() {
    try {
      const used = new Set(state.games.flatMap((g) => g.photos || []).concat(dialogPhotos));
      const keys = await allPhotoKeys();
      await Promise.all(keys.filter((k) => !used.has(k)).map(delPhoto));
    } catch (err) { /* storage unavailable */ }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
  }
  async function exportPhotos() {
    const out = {};
    for (const id of state.games.flatMap((g) => g.photos || [])) {
      const b = await getPhoto(id).catch(() => null);
      if (b) out[id] = await blobToDataUrl(b);
    }
    return out;
  }
  async function importPhotos(map) {
    for (const [id, url] of Object.entries(map || {})) {
      const blob = await (await fetch(url)).blob();
      await putPhoto(id, blob);
    }
  }

  // ---------- printable campaign sheet ----------
  function buildPrintSheet() {
    const c = capital();
    const name = (id) => (SHIPS.find((x) => x.id === id) || ALL_ADVS.find((a) => a.id === id)).name;
    const ships = SHIPS.filter(isOwned);
    const advs = ALL_ADVS.filter((a) => state.unlocked[a.id]);
    const recorded = new Set((state.purchases || []).map((p) => p.id));
    const groups = [];
    for (let n = 0; n <= state.games.length; n++) {
      const ps = (state.purchases || []).filter((p) => p.afterGame === n).map((p) => p.id);
      if (n === 0) Object.keys(state.unlocked).filter((id) => !recorded.has(id)).forEach((id) => ps.push(id));
      if (ps.length) groups.push({ n, items: ps });
    }
    const rivals = Object.values(state.rivals || {});
    const today = new Date().toISOString().slice(0, 10);
    return `
      <header class="p-head"><div><h1>A BILLION SUNS</h1><div>Campaign sheet · printed ${today}</div></div>
        <div class="p-corp"><b>${esc(state.corp || 'Unnamed corporation')}</b><span>${esc(state.ceo || '')}${state.startDate ? ' · since ' + esc(state.startDate) : ''}</span></div></header>
      <table class="p-stat"><tr>
        <td><b>${reputation()}</b>Reputation</td><td><b>${state.games.length}</b>Games played</td>
        <td><b>${c.total}</b>Capital earned</td><td><b>${c.avail}</b>Capital available</td><td><b>${esc(state.campScale || '3')}</b>Campaign scale</td></tr></table>
      <div class="p-cols">
        <section><h2>Ship classes</h2><ul>${ships.map((s) => `<li>${esc(s.name)}${s.wz ? ' (WZ)' : ''}<span>${s.always ? 'free' : s.cost}</span></li>`).join('')}</ul></section>
        <section><h2>Competitive advantages</h2>${advs.length ? `<ul>${advs.map((a) => `<li>L${a.lvl} ${esc(a.name)} <i>${esc(a.tree)}</i><span>${a.lvl}</span></li>`).join('')}</ul>` : '<p>None yet.</p>'}</section>
      </div>
      <h2>Capital history</h2>
      ${groups.length ? `<table class="p-table"><thead><tr><th>When</th><th>Bought</th><th>Capital</th></tr></thead><tbody>
        ${groups.map((g) => `<tr><td>${g.n === 0 ? 'Before game 1' : 'After game ' + g.n}</td><td>${g.items.map((id) => esc(name(id))).join(', ')}</td><td>−${g.items.reduce((t, id) => t + unlockCost(id), 0)}</td></tr>`).join('')}</tbody></table>` : '<p>No purchases yet.</p>'}
      <h2>Game log</h2>
      ${state.games.length ? `<table class="p-table"><thead><tr><th>#</th><th>Date</th><th>Opponent(s)</th><th>Scale</th><th>Result</th><th>Credits</th><th>Rep</th><th>Bought rep</th></tr></thead><tbody>
        ${state.games.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(g.date || '')}</td><td>${esc(g.opp || '')}</td><td>${esc(g.scale || '')}</td><td>${esc(g.win || '')}</td><td>${esc(g.credits || '')}</td><td>${esc(g.rep || '')}</td><td>${g.boughtRep ? 'Yes (−10)' : ''}</td></tr>`).join('')}</tbody></table>` : '<p>No games yet.</p>'}
      ${rivals.length ? `<h2>Standings</h2><table class="p-table"><thead><tr><th>Corporation</th><th>CEO</th><th>Reputation</th><th>Games</th><th>Shared</th></tr></thead><tbody>
        <tr><td><b>${esc(state.corp || 'Unnamed')}</b> (you)</td><td>${esc(state.ceo || '')}</td><td>${reputation()}</td><td>${state.games.length}</td><td>${today}</td></tr>
        ${rivals.map((r) => `<tr><td>${esc(r.corp || 'Unnamed')}</td><td>${esc(r.ceo || '')}</td><td>${r.rep || 0}</td><td>${(r.games || []).length}</td><td>${esc((r.sharedAt || '').slice(0, 10))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${state.notes ? `<h2>Notes &amp; house rules</h2><p class="p-notes">${esc(state.notes)}</p>` : ''}`;
  }
  $('#btn-print').addEventListener('click', () => {
    $('#print-view').innerHTML = buildPrintSheet();
    window.print();
  });

  // ---------- online campaign (Firebase anonymous sign-in + Firestore REST API) ----------
  // Each player's corporation is a document at campaigns/{code}/corps/{corpId}, holding the same
  // data as a share file. Players who join the same code see each other as rivals.
  const syncReady = () => typeof SYNC_CONFIG !== 'undefined' && !!(SYNC_CONFIG.apiKey && SYNC_CONFIG.projectId);
  const joined = () => syncReady() && !!(state.sync && state.sync.code);
  let idToken = null, idTokenExp = 0, syncing = false, lastPushed = '', pushTimer = null;

  async function authToken() {
    state.sync = state.sync || {};
    const s = state.sync;
    if (idToken && Date.now() < idTokenExp - 60000) return idToken;
    if (s.refreshToken) {
      const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + SYNC_CONFIG.apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.refreshToken),
      });
      if (r.ok) {
        const j = await r.json();
        idToken = j.id_token; idTokenExp = Date.now() + j.expires_in * 1000;
        s.uid = j.user_id; s.refreshToken = j.refresh_token; save();
        return idToken;
      }
    }
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + SYNC_CONFIG.apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    if (!r.ok) throw Object.assign(new Error('sign-in'), { status: r.status });
    const j = await r.json();
    idToken = j.idToken; idTokenExp = Date.now() + j.expiresIn * 1000;
    s.uid = j.localId; s.refreshToken = j.refreshToken; save();
    return idToken;
  }
  async function api(method, path, body) {
    const t = await authToken();
    const url = 'https://firestore.googleapis.com/v1/projects/' + SYNC_CONFIG.projectId + '/databases/(default)/documents/' + path;
    const r = await fetch(url, {
      method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw Object.assign(new Error('sync'), { status: r.status });
    return r.status === 204 ? null : r.json().catch(() => null);
  }
  const corpPath = () => 'campaigns/' + encodeURIComponent(state.sync.code) + '/corps/' + encodeURIComponent(state.corpId);

  async function syncPush(force) {
    if (!joined()) return;
    const p = sharePayload();
    const key = JSON.stringify(Object.assign({}, p, { sharedAt: '' }));
    if (!force && key === lastPushed) return;
    await authToken();
    await api('PATCH', corpPath(), { fields: {
      owner: { stringValue: state.sync.uid },
      data: { stringValue: JSON.stringify(p) },
      updatedAt: { timestampValue: new Date().toISOString() },
    } });
    lastPushed = key;
  }
  async function syncPull() {
    if (!joined()) return;
    const j = await api('GET', 'campaigns/' + encodeURIComponent(state.sync.code) + '/corps?pageSize=100');
    const online = {};
    ((j && j.documents) || []).forEach((d) => {
      try {
        const p = JSON.parse(d.fields.data.stringValue);
        if (p && p.type === SHARE_TYPE && p.corpId && p.corpId !== state.corpId) online[p.corpId] = Object.assign(p, { online: true });
      } catch (err) { /* skip bad document */ }
    });
    const rivals = {};
    Object.values(state.rivals || {}).forEach((r) => { if (!r.online && !online[r.corpId]) rivals[r.corpId] = r; });
    state.rivals = Object.assign(rivals, online);
  }
  function syncError(err) {
    if (!navigator.onLine) return 'Offline. Will sync when you’re back online.';
    if (err && err.status === 403) return 'The online campaign refused the update (permissions). Check the Firebase rules, or rejoin on this device.';
    if (err && err.status === 400 && err.message === 'sign-in') return 'Couldn’t sign in to the online campaign. Is anonymous sign-in enabled in Firebase?';
    return 'Couldn’t reach the online campaign. Try “Sync now” in a moment.';
  }
  async function syncNow(quiet) {
    if (!joined() || syncing) return;
    syncing = true;
    if (!quiet) setOnlineMsg('Syncing…');
    try {
      await syncPush(true);
      await syncPull();
      state.sync.lastSync = new Date().toISOString();
      state.sync.error = '';
    } catch (err) {
      state.sync.error = syncError(err);
    }
    syncing = false;
    save(); renderStandings(); renderShips(); renderOnline();
  }
  // Push changes a few seconds after they happen (games logged, unlocks bought, etc.).
  function schedulePush() {
    if (!joined()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { syncPush(false).catch(() => {}); }, 4000);
  }

  function newCampaignCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const v = crypto.getRandomValues(new Uint8Array(8));
    const s = Array.from(v, (x) => chars[x % chars.length]).join('');
    return 'ABS-' + s.slice(0, 4) + '-' + s.slice(4);
  }
  function setOnlineMsg(t) { const el = $('#online-msg'); if (el) el.textContent = t; }
  function ago(iso) {
    if (!iso) return 'never';
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  }
  function renderOnline() {
    const box = $('#online-box');
    if (!syncReady()) {
      box.innerHTML = '<p class="hint small">Online campaigns aren’t switched on for this app yet (a one-time Firebase setup; see the README).</p>';
      return;
    }
    if (!joined()) {
      box.innerHTML = `<p class="hint small">Online: everyone joins the same campaign code and standings update automatically.</p>
        <div class="online-join">
          <button type="button" class="btn primary" id="btn-online-start">Start online campaign</button>
          <form id="online-join-form" class="online-join-form"><input type="text" name="code" placeholder="ABS-XXXX-XXXX" autocapitalize="characters" autocomplete="off" aria-label="Campaign code" required><button type="submit" class="btn">Join</button></form>
        </div>
        <p class="status" id="online-msg"></p>`;
      return;
    }
    const s = state.sync;
    box.innerHTML = `<div class="online-on">
        <div><span class="dot ${s.error ? 'bad' : ''}"></span>Online campaign <b>${esc(s.code)}</b>
          <small>${s.error ? esc(s.error) : 'Synced ' + ago(s.lastSync)}</small></div>
        <div class="online-btns">
          <button type="button" class="btn sm" id="btn-online-share">Share code</button>
          <button type="button" class="btn sm" id="btn-online-sync">Sync now</button>
          <button type="button" class="btn sm danger" id="btn-online-leave">Leave</button>
        </div></div>
      <p class="status" id="online-msg"></p>`;
  }
  async function joinCampaign(code) {
    state.sync = Object.assign(state.sync || {}, { code, error: '', lastSync: '' });
    lastPushed = '';
    renderOnline();
    await syncNow();
  }
  $('#online-box').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'btn-online-start') {
      if (!state.corp && !confirm('Your corporation has no name yet. Start anyway?')) return;
      await joinCampaign(newCampaignCode());
    } else if (t.id === 'btn-online-sync') {
      await syncNow();
    } else if (t.id === 'btn-online-share') {
      const text = 'Join my A Billion Suns campaign in ABS Companion: Overview > Rivals > Join, code ' + state.sync.code + '\n' + location.origin + location.pathname;
      try {
        if (navigator.share) { await navigator.share({ text }); return; }
        await navigator.clipboard.writeText(state.sync.code);
        setOnlineMsg('Code copied: ' + state.sync.code);
      } catch (err) { if (!err || err.name !== 'AbortError') setOnlineMsg('Code: ' + state.sync.code); }
    } else if (t.id === 'btn-online-leave') {
      if (!confirm('Leave online campaign ' + state.sync.code + '? Rivals from it will be removed from this phone.')) return;
      const remove = confirm('Also remove your corporation from the online campaign, so others stop seeing it?');
      if (remove) { try { await api('DELETE', corpPath()); } catch (err) { /* already gone or offline */ } }
      Object.keys(state.rivals || {}).forEach((id) => { if (state.rivals[id].online) delete state.rivals[id]; });
      state.sync.code = ''; state.sync.error = '';
      save(); renderOnline(); renderStandings(); renderShips();
    }
  });
  $('#online-box').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^ABS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) { setOnlineMsg('That doesn’t look like a campaign code (ABS-XXXX-XXXX).'); return; }
    await joinCampaign(code);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(true); });
  window.addEventListener('online', () => syncNow(true));
  setInterval(() => { if (document.visibilityState === 'visible' && prefs.tab === 'overview') syncNow(true); }, 60000);

  // ---------- boot ----------
  $('#b-dmg-rules').textContent = DAMAGE_RULES;
  function renderAll() { renderBound(); renderUnlocks(); renderGames(); renderShips(); renderBattle(); renderStatus(); }
  renderAll();
  renderOnline();
  syncNow(true);
  showTab($('[data-view="' + prefs.tab + '"]') ? prefs.tab : 'overview');

  // ---------- updates ----------
  // Check for a new version on launch and whenever the app returns to the foreground;
  // when a new service worker takes over, reload once so the new files are used.
  $('#app-version').textContent = 'Version ' + APP_VERSION;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Skip the very first install (nothing was controlling the page yet); reload on real updates.
    let controlled = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!controlled) { controlled = true; return; }
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      $('#btn-update').addEventListener('click', () => {
        $('#app-version').textContent = 'Checking…';
        reg.update().then(() => {
          if (!reg.installing && !reg.waiting) location.reload();   // nothing new: just refresh
        }).catch(() => { $('#app-version').textContent = 'Version ' + APP_VERSION + ' (offline)'; });
      });
    }).catch(() => {});
  }
})();
