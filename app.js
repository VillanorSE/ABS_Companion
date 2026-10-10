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
      nonCampaign: false,    // one-off game: all ship classes, no campaign advantages, not logged
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
  prefs.tab = { campaign: 'overview', games: 'log' }[prefs.tab] || prefs.tab;   // tabs renamed in v2

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
  function renderUnlocks() {
    $('#ship-checklist').innerHTML = SHIPS.map((s) => {
      const on = isOwned(s);
      return `<label class="item ${on ? 'on' : ''} ${s.always ? 'locked' : ''}">
        <input type="checkbox" data-unlock="${s.id}" ${on ? 'checked' : ''} ${s.always ? 'disabled' : ''}>
        <span class="name">${esc(s.name)}${s.wz ? '<span class="badge wz">WZ</span>' : ''}
          ${s.always ? '<small>Always available</small>' : ''}</span>
        <span class="cost">${s.always ? '–' : s.cost}</span>
      </label>`;
    }).join('');

    $('#adv-checklist').innerHTML = ADVANTAGES.map((t) => `
      <div class="tree"><h3>${esc(t.tree)}</h3><div class="list">
        ${t.items.map(([id, lvl, name, desc]) => {
          const on = !!state.unlocked[id];
          return `<label class="item ${on ? 'on' : ''}">
            <input type="checkbox" data-unlock="${id}" ${on ? 'checked' : ''}>
            <span class="name"><span class="lvl">L${lvl}</span>${esc(name)}<small>${esc(desc)}</small></span>
            <span class="cost">${lvl}</span>
          </label>`;
        }).join('')}
      </div></div>`).join('');
  }
  document.addEventListener('change', (e) => {
    const id = e.target.dataset && e.target.dataset.unlock;
    if (!id) return;
    if (e.target.checked) state.unlocked[id] = true; else delete state.unlocked[id];
    e.target.closest('.item').classList.toggle('on', e.target.checked);
    save();
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
  function weaponRow(kind, w) {
    if (!w) return `<div class="wrow none"><span class="kind ${kind}">${kind}</span><span class="wn">None</span><span></span></div>`;
    return `<div class="wrow">
      <span class="kind ${kind}">${kind}</span>
      <span class="wn">${esc(w.name)}${w.note ? `<small>${esc(w.note)}</small>` : ''}</span>
      <span class="wv">${esc(w.range)} · <b>${esc(w.dice)}</b> · dmg ${w.dmg}</span>
    </div>`;
  }

  function shipCard(s) {
    const owned = isOwned(s);
    const jump = 6 - s.mass;
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
      <div class="stats">
        <div><b>${s.mass}</b><span>Mass</span></div>
        <div><b>${s.thrust == null ? '–' : s.thrust + '″'}</b><span>Thrust</span></div>
        <div><b>${s.sil}</b><span>Silhouette</span></div>
        <div><b>${s.shields}</b><span>Shields</span></div>
      </div>
      <div class="weap">${weaponRow('pri', s.pri)}${weaponRow('aux', s.aux)}</div>
      <div class="derived">
        <span>Jump range <b>${jump}″</b></span>
        <span>Mother’s wing <b>${s.mass ? s.mass + '″' : '—'}</b></span>
        ${owned || s.always ? '' : `<span>Unlock <b>${s.cost} capital</b></span>`}
      </div>
      ${s.rules.length ? `<ul class="rules">${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    </article>`;
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
    $('#advs-owned-list').innerHTML = advs.length
      ? advs.map((a) => `<div class="adv"><span class="lvl">L${a.lvl}</span><b>${esc(a.name)}</b> <span style="color:var(--muted);font-size:12px">${esc(a.tree)}</span><small>${esc(a.desc)}</small></div>`).join('')
      : '<p class="none">No competitive advantages bought yet.</p>';
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
      const pips = Array.from({ length: n }, (_, i) =>
        `<button type="button" class="pip ${i < spent ? 'used' : ''}" ${s.spendable ? `data-pip="${s.key}" data-i="${i}" aria-label="Token ${i + 1}${i < spent ? ' (spent)' : ''}"` : 'disabled aria-hidden="true"'}></button>`).join('');
      const sub = s.key === 'seize' ? `Initiative roll-off: <b>${seizeDie(n)}</b>` : `${n - spent} left`;
      return `<div class="slot slot-${s.key}">
        <div class="slot-h"><b>${s.name}</b><span>${sub}</span></div>
        <div class="slot-body">
          <div class="pips">${pips || '<span class="nopip">No tokens</span>'}</div>
          <div class="stepper sm"><button type="button" data-helm="${s.key}" data-d="-1" aria-label="Remove token from ${s.name}">−</button><b>${n}</b><button type="button" data-helm="${s.key}" data-d="1" aria-label="Add token to ${s.name}">+</button></div>
        </div>
        ${s.help ? `<p class="slot-help">${s.help}</p>` : ''}
      </div>`;
    }).join('');

    // credits
    const cr = battleCredits();
    $('#b-credits').textContent = signed(cr);
    $('#b-credits-state').textContent = cr > 0 ? 'Profit' : cr < 0 ? 'Deficit' : 'Break even';
    $('#b-credits-card').className = 'credits ' + (cr > 0 ? 'profit' : cr < 0 ? 'deficit' : '');

    // battlegroups
    const inPlay = b.bgs.filter((g) => g.status === 'in');
    const utes = inPlay.reduce((s, g) => s + (/Utility/.test(shipById(g.ship).name) ? g.count : 0), 0);
    const util = $('#b-util');
    util.textContent = utes ? 'Utility ships ' + utes + '/' + battleScale() : '';
    util.classList.toggle('warn', utes > battleScale());
    $('#b-bgs').innerHTML = b.bgs.length ? b.bgs.map((g) => {
      const s = shipById(g.ship);
      return `<div class="bg st-${g.status}">
        <div class="bg-main">
          <b>${esc(g.name || 'BG ' + g.id)}</b> · ${g.count}× ${esc(s.name)}
          <small>Round ${g.round} · ${g.count * s.cost} credits</small>
        </div>
        <button type="button" class="status" data-bgstatus="${g.id}">${STATUS[g.status]}</button>
        <button type="button" class="x" data-bgdel="${g.id}" aria-label="Remove battlegroup">×</button>
      </div>`;
    }).join('') : '<p class="empty sm">No battlegroups requisitioned yet.</p>';

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

  $('#view-battle').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const b = B();
    if (t.dataset.bstep === 'round') {
      const next = Math.max(1, b.round + num(t.dataset.d));
      if (next > b.round) {   // End Phase: remove all CMD tokens from the helm
        b.helm = { seize: 0, jump: 0, tac: 0 };
        b.spent = { jump: 0, tac: 0 };
      }
      b.round = next;
    } else if (t.dataset.bstep === 'scale') {
      b.scale = Math.min(10, Math.max(1, battleScale() + num(t.dataset.d)));
    } else if (t.dataset.helm) {
      const k = t.dataset.helm;
      b.helm[k] = Math.max(0, b.helm[k] + num(t.dataset.d));
      if (b.spent[k] > b.helm[k]) b.spent[k] = b.helm[k];
    } else if (t.dataset.pip) {
      const k = t.dataset.pip, i = +t.dataset.i;
      b.spent[k] = b.spent[k] === i + 1 ? i : i + 1;   // tap the last spent token to un-spend it
    } else if (t.dataset.earn) {
      addLedger(num(t.dataset.earn), ''); return;
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
    b.bgs.push({ id, ship: s.id, count: reqCount, round: b.round, name, status: 'in' });
    reqDlg.close();
    addLedger(-s.cost * reqCount, 'Requisition ' + (name || 'BG ' + id) + ': ' + reqCount + '× ' + s.name, id);
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
    const fleet = b.bgs.map((g) => `${g.name || 'BG ' + g.id}: ${g.count}× ${shipById(g.ship).name} (R${g.round}, ${STATUS[g.status].toLowerCase()})`);
    openGame(-1, {
      scale: battleScale(),
      credits: String(battleCredits()),
      notes: [b.round + ' rounds.', ...fleet].join('\n'),
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
  function renderAll() { renderBound(); renderUnlocks(); renderGames(); renderShips(); renderBattle(); renderStatus(); }
  renderAll();
  showTab($('[data-view="' + prefs.tab + '"]') ? prefs.tab : 'overview');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
