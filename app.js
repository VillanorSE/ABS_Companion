(function () {
  'use strict';

  const STORE_KEY = 'abs-companion-v1';
  const PREFS_KEY = 'abs-companion-prefs';

  // ---------- state ----------
  function blankState() {
    return {
      version: 1,
      corp: '', ceo: '', startDate: '',
      campScale: '', totalRep: '',
      unlocked: {},            // id -> true (ship_* and adv_*)
      games: [],               // {scale,date,opp,win,credits,rep,boughtRep,purchases,notes}
      summary: { finalScale: '', finalRep: '', finalCapital: '', winner: '' },
      notes: '',
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
      nonCampaign: false,
      contracts: [],         // contract ids, e.g. 'J♠'    // one-off game: all ship classes, no campaign advantages, not logged
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
  const prefs = load(PREFS_KEY, { tab: 'overview', shipFilter: 'mine' });
  prefs.tab = { campaign: 'overview', games: 'log', ships: 'stats', more: 'overview' }[prefs.tab] || prefs.tab;   // renamed tabs

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store(STORE_KEY, state), 250);
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
    let canCount = 0;
    const group = (title, items, note) => {
      items.sort((x, y) => x.cost - y.cost);
      const can = items.filter((o) => o.cost <= avail), later = items.filter((o) => o.cost > avail);
      canCount += can.length;
      return `<div class="buy-group"><h4>${title}</h4>
        ${can.length ? can.map((o) => row(o, true)).join('') : '<p class="none">Nothing affordable right now.</p>'}
        ${later.length ? `<p class="later-h">Need more capital</p>${later.map((o) => row(o, false)).join('')}` : ''}
        ${note ? `<p class="hint small">${note}</p>` : ''}</div>`;
    };
    const html = group('Ship classes', ships) +
      group('Competitive advantages', advs, 'Only one Level 0 advantage, and you may research one advantage per campaign game.');
    $('#buynow-count').textContent = '(' + canCount + ')';
    $('#buynow-list').innerHTML = html;
  }
  $('#buynow-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (!b) return;
    state.unlocked[b.dataset.buy] = true;
    save(); renderUnlocks(); renderStatus(); renderShips(); renderBattle();
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
    const ab = e.target.closest('[data-toggle-adv]');
    if (ab) {
      const body = ab.closest('.item-wrap, .adv').querySelector('.expand-body');
      setOpen(ab, body, body.hidden);
    }
  });
  document.addEventListener('change', (e) => {
    const id = e.target.dataset && e.target.dataset.unlock;
    if (!id) return;
    if (e.target.checked) state.unlocked[id] = true; else delete state.unlocked[id];
    save();
    renderUnlocks();
    renderStatus();
    renderShips();
    renderBattle();
  });

  // ---------- games ----------
  function renderGames() {
    const list = $('#game-list');
    $('#game-empty').hidden = state.games.length > 0;
    list.innerHTML = state.games.map((g, i) => {
      const bits = [];
      if (g.scale !== '' && g.scale != null) bits.push('Scale ' + esc(g.scale));
      if (g.credits) bits.push(esc(g.credits) + ' credits');
      if (g.rep) bits.push('+' + esc(g.rep) + ' rep');
      if (g.boughtRep) bits.push('bought rep (−10)');
      if (g.date) bits.push(esc(g.date));
      const extra = [g.purchases && 'Purchased: ' + g.purchases, g.notes].filter(Boolean).join('\n');
      return `<div class="game" data-game="${i}" role="button" tabindex="0">
        <span class="num">${i + 1}</span>
        <span class="opp">${g.opp ? 'vs ' + esc(g.opp) : '<span style="color:var(--muted)">Game ' + (i + 1) + '</span>'}</span>
        ${g.win ? `<span class="res ${esc(g.win)}">${esc(g.win)}</span>` : '<span></span>'}
        <span class="meta">${bits.join(' · ') || 'Tap to edit'}</span>
        ${extra ? `<div class="extra">${esc(extra)}</div>` : ''}
      </div>`;
    }).join('');
  }

  const dlg = $('#game-dialog');
  const form = $('#game-form');
  let editing = -1;
  let fromBattle = false;    // saving this dialog finishes the current Battle
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
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeGame() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  $('#btn-add-game').addEventListener('click', () => openGame(-1));
  $('#game-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-game]');
    if (card) openGame(+card.dataset.game);
  });
  $('#game-list').addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-game]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openGame(+card.dataset.game); }
  });
  $('#btn-cancel-game').addEventListener('click', closeGame);
  $('#btn-del-game').addEventListener('click', () => {
    if (editing < 0 || !confirm('Delete game ' + (editing + 1) + '?')) return;
    state.games.splice(editing, 1);
    save(); closeGame(); renderGames(); renderStatus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      g[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    if (editing >= 0) state.games[editing] = g; else state.games.push(g);
    if (fromBattle) { state.battle = blankBattle(); renderBattle(); showTab('log'); }
    save(); closeGame(); renderGames(); renderStatus();
  });
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
  // A stat changed by an advantage shows its difference from the printed value, e.g. 2 (+1).
  const sgn = (d) => (d > 0 ? '+' : '−') + Math.abs(d);
  const delta = (txt) => `<sup class="delta">(${txt})</sup>`;
  const modVal = (val, base, unit) => `${val}${unit || ''}${val !== base ? delta(sgn(val - base)) : ''}`;
  function rangeDelta(range, base) {
    if (!base || range === base) return '';
    const a = /(\d+)\D+(\d+)/.exec(range), b = /(\d+)\D+(\d+)/.exec(base);
    const dMin = a[1] - b[1], dMax = a[2] - b[2];
    return delta(dMin === dMax ? sgn(dMax) : dMin === 0 ? sgn(dMax) + ' max' : sgn(dMin) + '/' + sgn(dMax));
  }

  function weaponRow(kind, w) {
    if (!w) return `<div class="wrow none"><span class="kind ${kind}">${kind}</span><span class="wn">None</span><span></span></div>`;
    const range = esc(w.range) + rangeDelta(w.range, w.baseRange);
    return `<div class="wrow">
      <span class="kind ${kind}">${kind}</span>
      <span class="wn">${esc(w.name)}${w.note ? `<small>${esc(w.note)}</small>` : ''}</span>
      <span class="wv">${range} · <b>${esc(w.dice)}</b> · dmg ${modVal(w.dmg, w.baseDmg == null ? w.dmg : w.baseDmg)}</span>
    </div>`;
  }

  // Your advantages apply to your own (unlocked) ship classes.
  const campaignHas = (id) => !!state.unlocked[id];

  function shipCard(s) {
    const owned = isOwned(s);
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
      ${shipBody(s)}
    </article>`;
  }

  function shipBody(s) {
    const owned = isOwned(s);
    const f = fleetStats(s, owned ? campaignHas : () => false);
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
      ${advNames.length ? `<p class="applied">Includes your advantages: ${advNames.map(esc).join(', ')}</p>` : ''}
      ${s.rules.length ? `<ul class="rules">${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}`;
  }

  function renderShips() {
    const mine = SHIPS.filter(isOwned);
    $('#cnt-mine').textContent = '(' + mine.length + ')';
    $('#cnt-all').textContent = '(' + SHIPS.length + ')';
    $$('[data-shipfilter]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.shipfilter === prefs.shipFilter)));
    const list = prefs.shipFilter === 'all' ? SHIPS : mine;
    $('#ship-cards').innerHTML = list.map(shipCard).join('');

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
      <div class="expand-body" ${open ? '' : 'hidden'}>
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
            <small>Round ${g.round} · ${start * s.cost} cr · Sil ${sil} · Shields ${f.shields} · Ⓜ${s.mass}</small>
            ${canAct ? `<span class="act-chip">${g.act ? '✓ Activated' : 'Tap to mark activated'}</span>` : ''}
          </div>
          <button type="button" class="status" data-bgstatus="${g.id}">${STATUS[g.status]}</button>
          <button type="button" class="x" data-bgdel="${g.id}" aria-label="Remove battlegroup">×</button>
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
    $('#btn-contracts').textContent = picked.length ? 'Change contracts (' + picked.length + ')' : 'Choose contracts';
    $('#b-contracts').innerHTML = picked.map(contractCard).join('');

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
    if (card) { toggleContract(card); return; }
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
    const fleet = b.bgs.map((g) => { const st = g.start || g.count; return `${g.name || 'BG ' + g.id}: ${st}× ${shipById(g.ship).name} (R${g.round}, ${st - g.count} lost, ${STATUS[g.status].toLowerCase()})`; });
    openGame(-1, {
      scale: battleScale(),
      credits: String(battleCredits()),
      notes: [b.round + ' rounds.' + (b.contracts && b.contracts.length ? ' Contracts: ' + b.contracts.map((id) => CONTRACTS.find((c) => c.id === id).name).join(', ') + '.' : ''), ...fleet].join('\n'),
    });
  });
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
    state.unlocked = state.unlocked || {};
    state.games = Array.isArray(state.games) ? state.games : [];
    store(STORE_KEY, state);
    renderAll();
  }

  $('#btn-export').addEventListener('click', () => {
    download(safeName() + '_ABS_Campaign.json', JSON.stringify(state, null, 2), 'application/json');
    setStatus('Backup downloaded.');
  });
  $('#btn-import').addEventListener('click', () => $('#file-json').click());
  $('#btn-import-html').addEventListener('click', () => $('#file-html').click());

  $('#file-json').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (typeof data !== 'object' || !data || !('unlocked' in data)) throw new Error('not a backup');
      if (!confirm('Replace the current campaign with "' + f.name + '"?')) return;
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
          purchases: val('log_' + (b + 6)), date: val('log_' + (b + 7)), notes: val('log_' + (b + 8)) };
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
    setStatus('Campaign reset.');
  });

  // ---------- boot ----------
  $('#b-dmg-rules').textContent = DAMAGE_RULES;
  function renderAll() { renderBound(); renderUnlocks(); renderGames(); renderShips(); renderBattle(); renderStatus(); }
  renderAll();
  showTab($('[data-view="' + prefs.tab + '"]') ? prefs.tab : 'overview');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
