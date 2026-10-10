// Competitive advantage logic: research prerequisites and their effects on ship stats.

// Prerequisites (rulebook p.54–60). 'only0' = must have no other Level 0 advantage.
// Otherwise alternatives separated by '|', each a comma list of tree+level that must all be owned,
// e.g. 'AG0,AG1|HE2' = "Level 0 and 1 Aggression, or Level 2 Helmsmanship".
const TREE_CODE = { Aggression: 'AG', Discipline: 'DI', Endurance: 'EN', Helmsmanship: 'HE', Logistics: 'LO', Military: 'MI' };
const ADV_REQS = {
  adv_19: 'only0', adv_20: 'AG0', adv_21: 'AG0', adv_22: 'AG0', adv_23: 'AG0', adv_24: 'AG0,AG1|HE2', adv_25: 'AG0,AG1,AG2|MI3',
  adv_26: 'only0', adv_27: 'DI0', adv_28: 'DI0,DI1|LO2', adv_29: 'DI0,DI1', adv_30: 'DI0,DI1', adv_31: 'DI0,DI1,DI2|EN3', adv_32: 'DI0,DI1,DI2',
  adv_33: 'only0', adv_34: 'EN0', adv_35: 'EN0', adv_36: 'EN0', adv_37: 'EN0,EN1', adv_38: 'EN0,EN1|LO2', adv_39: 'EN0,EN1,EN2',
  adv_40: 'only0', adv_41: 'HE0', adv_42: 'HE0', adv_43: 'HE0,HE1', adv_44: 'HE0,HE1|AG2', adv_45: 'HE0,HE1,HE2|MI3', adv_46: 'HE0,HE1,HE2',
  adv_47: 'only0', adv_48: 'LO0', adv_49: 'LO0,LO1', adv_50: 'LO0,LO1', adv_51: 'LO0,LO1,LO2', adv_52: 'LO0,LO1,LO2|DI3', adv_53: 'LO0,LO1,LO2,LO3',
  adv_54: 'only0', adv_55: 'MI0', adv_56: 'MI0', adv_57: 'MI0,MI1', adv_58: 'MI0,MI1|HE2', adv_59: 'MI0,MI1,MI2|DI3', adv_60: 'MI0,MI1,MI2|AG3',
};

// Advantages with a limited number of uses, tracked on the Battle tab.
const ONCE_PER = [
  { id: 'adv_31', per: 'game', what: 'End Phase: remove 1 damage from every friendly battlegroup' },
  { id: 'adv_53', per: 'game', what: 'Reveal two contract cards, keep either' },
  { id: 'adv_21', per: 'round', what: 'One battlegroup may Go Rogue repeatedly' },
  { id: 'adv_52', per: 'round', what: 'First jump point deployed refunds a Jump In token' },
];

// Which owned advantages to list under each helm slot's rules.
const HELM_ADVS = {
  seize: ['adv_28', 'adv_32'],
  jump: ['adv_23', 'adv_41', 'adv_47', 'adv_52'],
  tac: ['adv_21', 'adv_22', 'adv_27', 'adv_29', 'adv_30', 'adv_35', 'adv_43', 'adv_48', 'adv_58', 'adv_59'],
};

const ADV_LIST = ADVANTAGES.flatMap((t) => t.items.map(([id, lvl, name]) => ({ id, lvl, name, code: TREE_CODE[t.tree] + lvl })));

function ownedLevels(unlocked) {
  return new Set(ADV_LIST.filter((a) => unlocked[a.id]).map((a) => a.code));
}

// Can this advantage be researched now (ignoring cost)?
function advEligible(id, unlocked) {
  if (unlocked[id]) return false;
  const req = ADV_REQS[id];
  if (req === 'only0') return !ADV_LIST.some((a) => a.lvl === 0 && unlocked[a.id]);
  const have = ownedLevels(unlocked);
  return req.split('|').some((opt) => opt.split(',').every((code) => have.has(code)));
}

// Ship stats with this fleet's advantages applied. `has(id)` says whether an advantage applies.
function fleetStats(s, has) {
  const utility = /Utility/.test(s.name);
  const applied = new Set();
  const use = (id) => { if (has(id)) { applied.add(id); return true; } return false; };

  let sil = s.sil;
  if (use('adv_33')) sil += 1;                            // Heavy Frames
  if (use('adv_40')) sil -= 1;                            // Light Frames
  sil = Math.max(1, sil);

  let thrust = s.thrust;
  if (thrust != null) {
    if (has('adv_40')) thrust += 1;                       // Light Frames
    if (use('adv_46')) thrust += 2;                       // Superior Thruster Arrays
  }

  let shields = s.shields;
  if (utility && use('adv_38')) shields += 1;             // Heavily Shielded Utes
  if (s.shields >= 1 && use('adv_39')) shields += 1;      // Advanced Shield Generators

  const weapon = (w, kind) => {
    if (!w) return null;
    const m = /(\d+)\D+(\d+)/.exec(w.range);
    let min = +m[1], max = +m[2];
    if (kind === 'pri' && use('adv_24')) { min = Math.max(0, min - 2); max = Math.max(2, max - 2); }   // Close And Personal (house rule: max ≥ 2″)
    if (kind === 'pri' && use('adv_55')) max += 4;                                   // Longer Range Munitions
    if (use('adv_56')) { min += 2; max += 2; }                                       // Remote Target Patterning
    if (kind === 'aux' && use('adv_60')) max += 1;                                   // Advanced Blaster Technology
    let dmg = w.dmg;
    if (/D1[02]/.test(w.dice) && use('adv_54')) dmg += 1;                            // Improved Ordinance
    const range = min + '″–' + max + '″';
    return Object.assign({}, w, { range, dmg, baseRange: w.range, baseDmg: w.dmg });
  };

  const jump = use('adv_41') ? 6 : 6 - s.mass;            // Advanced Nav. Computers
  const wing = s.mass ? (use('adv_36') ? 2 : 1) * s.mass : 0;   // Improved Point Defences
  const scan = utility && use('adv_49') ? 5 : 3;          // Advanced Material Scanners
  const explode = s.mass + (use('adv_19') ? 1 : 0);       // Unstable Engine Shielding

  return { sil, thrust, shields, pri: weapon(s.pri, 'pri'), aux: weapon(s.aux, 'aux'), jump, wing, scan, explode, applied };
}
