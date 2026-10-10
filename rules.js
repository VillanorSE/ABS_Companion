// Rules reference text, paraphrased from the A Billion Suns rulebook with FAQ v1.2 and
// Warzone errata applied. Written in our own words (not verbatim) because this site is public.

// Full competitive advantage rules (rulebook p.54–60). id -> [requirement, rules]
const ONLY_L0 = 'Must be your first advantage: you can’t take it if you already have any other Level 0 advantage.';
const ADV_DETAILS = {
  adv_19: [ONLY_L0, 'When a ship in this fleet is destroyed and you roll to see if it explodes, and when it explodes, treat its Mass (Ⓜ) as 1 higher. A higher Ⓜ means it explodes more often (D6 ≤ Ⓜ), the blast reaches further (Ⓜ″) and it rolls more dice (ⓂD6).'],
  adv_20: ['Level 0 Aggression.', 'When a ship in this fleet rolls a dud that causes a Critical Weapon Malfunction, that dud also counts as a hit against the target. You still suffer the malfunction damage.'],
  adv_21: ['Level 0 Aggression.', 'Once per round, one battlegroup in this fleet may Go Rogue as many times as it likes during its own activation, up to its Silhouette value, even if the damage would destroy one of its ships. Normally a battlegroup may Go Rogue only once per activation.'],
  adv_22: ['Level 0 Aggression.', 'Battlegroups in this fleet count their Ⓜ as 1 higher for Power to Weapon Systems, so they can spend one extra CMD token on it.'],
  adv_23: ['Level 0 Aggression.', 'When a ship from this fleet jumps in, it may take 1 damage to upgrade the Jump Shock attacks that jump causes to D8 dice with damage 2. Not usable when jump-hopping.'],
  adv_24: ['Level 0 and 1 Aggression, or Level 2 Helmsmanship.', 'All ships in this fleet reduce both the minimum and maximum range of their primary weapon systems by 2″ (e.g. 9″–18″ becomes 7″–16″).'],
  adv_25: ['Level 0, 1 and 2 Aggression, or Level 3 Military.', 'When a battlegroup from this fleet attacks with auxiliary weapons during its own activation, it may re-roll any misses once. This is on top of any re-rolls from an Engage order.'],
  adv_26: [ONLY_L0, 'When a battlegroup from this fleet uses the Red Alert order, it discards one extra damage token (D3+1 instead of D3).'],
  adv_27: ['Level 0 Discipline.', 'When this CEO spends a CMD token on Executive Override, they may re-roll two dice instead of one. FAQ: with Chain of Command, only one of the two re-rolls needs to succeed to get the token back.'],
  adv_28: ['Level 0 and 1 Discipline, or Level 2 Logistics.', 'Whenever this CEO rolls off, they subtract 1 from their roll (to a minimum of 1). Lowest wins roll-offs, so this always helps, including the initiative roll-off.'],
  adv_29: ['Level 0 and 1 Discipline.', 'After this CEO spends a CMD token on Executive Override to re-roll an attack die or saving throw, if the re-roll is a successful hit or save, put 1 CMD token back on Tactical.'],
  adv_30: ['Level 0 and 1 Discipline.', 'Battlegroups in this fleet count their Ⓜ as 1 higher for anything that spends CMD tokens based on Ⓜ (e.g. up to Ⓜ+1 tokens on Power to Weapon Systems or Power to Shields).'],
  adv_31: ['Level 0, 1 and 2 Discipline, or Level 3 Endurance.', 'Once per game, in the End Phase, this CEO may remove one damage token from every friendly battlegroup in play.'],
  adv_32: ['Level 0, 1 and 2 Discipline.', 'This CEO starts every round with one extra CMD token (Ⓢ+4 instead of Ⓢ+3). The Battle tab adds this automatically in campaign games.'],
  adv_33: [ONLY_L0, 'All battlegroups in this fleet have +1 Silhouette. They are easier to hit, but each ship absorbs one more damage token before it is destroyed.'],
  adv_34: ['Level 0 Endurance.', 'When a battlegroup in this fleet scores one or more unsaved hits with a passive attack on an enemy battlegroup, it may discard all of those hits (they deal no damage) to count its own Shields as 1 higher during its next attack only.'],
  adv_35: ['Level 0 Endurance.', 'Battlegroups in this fleet count their Ⓜ as 1 higher for Power to Shields, so they can spend one extra CMD token on it.'],
  adv_36: ['Level 0 Endurance.', 'Ships in this fleet have a mother’s wing radius of 2Ⓜ″ instead of Ⓜ″, so they can protect lighter friendly battlegroups from further away.'],
  adv_37: ['Level 0 and 1 Endurance.', 'When a battlegroup in this fleet attacks an enemy battlegroup whose Engage Target is this battlegroup, it may re-roll misses.'],
  adv_38: ['Level 0 and 1 Endurance, or Level 2 Logistics.', 'Utility ship battlegroups (Light and Medium Utility Ships) in this fleet have +1 Shields.'],
  adv_39: ['Level 0, 1 and 2 Endurance.', 'Every battlegroup in this fleet that has Shields 1 or more gains +1 Shields. Ships with Shields 0, such as wings, gain nothing.'],
  adv_40: [ONLY_L0, 'All battlegroups in this fleet have −1 Silhouette (to a minimum of 1, per the Warzone errata) and +1″ Thrust. They are harder to hit, but each ship absorbs one fewer damage token.'],
  adv_41: ['Level 0 Helmsmanship.', 'Battlegroups in this fleet count their Ⓜ as 0 when working out Jump Range, so every ship class has a 6″ jump range.'],
  adv_42: ['Level 0 Helmsmanship.', 'At the end of an enemy battlegroup’s movement step, any battlegroup in this fleet may take 1 damage to let every ship in it immediately pivot up to 90°.'],
  adv_43: ['Level 0 and 1 Helmsmanship.', 'Battlegroups in this fleet may spend a single CMD token from Tactical to get both Power to Engines and Power to Inertial Dampeners.'],
  adv_44: ['Level 0 and 1 Helmsmanship, or Level 2 Aggression.', 'When moving, battlegroups in this fleet may pivot either before or after moving straight ahead. Normally they must pivot first.'],
  adv_45: ['Level 0, 1 and 2 Helmsmanship, or Level 3 Military.', 'When a battlegroup in this fleet activates, its controller may resolve the Active Attacks Step before the Movement Step (shoot, then move).'],
  adv_46: ['Level 0, 1 and 2 Helmsmanship.', 'All battlegroups in this fleet gain +2″ Thrust.'],
  adv_47: [ONLY_L0, 'The fleet’s first Light Utility Ship doesn’t count toward the utility ship limit. You may have up to Ⓢ utility ships of any kind in play, plus one extra Light Utility Ship.'],
  adv_48: ['Level 0 Logistics.', 'Whenever this CEO reveals a contract card, they may put one previously spent CMD token back onto Tactical.'],
  adv_49: ['Level 0 and 1 Logistics.', 'Utility ships in this fleet have +2″ scan range (5″ instead of 3″).'],
  adv_50: ['Level 0 and 1 Logistics.', 'If a friendly battlegroup is carrying tokens needed to score a contract (Cargo, Ore, Kraken Hearts, a Captured Spy, etc.), it gains +1 Shields for each card currently in this CEO’s hand.'],
  adv_51: ['Level 0, 1 and 2 Logistics.', 'If an enemy ship scans while within scan range of one or more of this fleet’s utility ships, that enemy ship immediately suffers 1 damage.'],
  adv_52: ['Level 0, 1 and 2 Logistics, or Level 3 Discipline.', 'The first time each round this CEO spends a CMD token to deploy a jump point, they gain a CMD token in Jump In.'],
  adv_53: ['Level 0, 1, 2 and 3 Logistics.', 'Once per game, when revealing a contract card, this CEO may reveal two cards and choose which one counts as revealed. The other returns to where it came from. When revealing from a contract deck, reveal the top two cards.'],
  adv_54: [ONLY_L0, 'All D10 and D12 attack dice rolled by ships in this fleet deal +1 damage when they hit.'],
  adv_55: ['Level 0 Military.', 'Battlegroups in this fleet add 4″ to the maximum range of all primary weapon systems (minimum range is unchanged).'],
  adv_56: ['Level 0 Military.', 'Battlegroups in this fleet add 2″ to both the minimum and maximum range of all weapon systems. FAQ: a 6″–12″ weapon becomes 8″–14″, and 0″–6″ becomes 2″–8″.'],
  adv_57: ['Level 0 and 1 Military.', 'When a battlegroup from this fleet targets the same enemy battlegroup with both its primary and auxiliary weapons, subtract 1 from all its attack rolls against that target (to a minimum of 1). Lower is better, and it can create more criticals.'],
  adv_58: ['Level 0 and 1 Military, or Level 2 Helmsmanship.', 'This CEO may discard a CMD token to give one friendly battlegroup a 360° auxiliary arc of fire for the rest of the current activation.'],
  adv_59: ['Level 0, 1 and 2 Military, or Level 3 Discipline.', 'This fleet’s Combined Orders reach battlegroups wholly within Ⓜ+6″ instead of Ⓜ+3″.'],
  adv_60: ['Level 0, 1 and 2 Military, or Level 3 Aggression.', 'Add 1″ to the maximum range of all auxiliary weapon systems in this fleet.'],
};
const ADV_FAQ_NOTE = 'FAQ: an “or Level N <tree>” requirement can be met on its own. You don’t need anything in the advantage’s own tree.';

// Command helm reference (Command Phase, Jump Phase, Commands, Go Rogue), errata applied.
const HELM_INFO = {
  seize: [
    ['Command Phase', 'Each round: (1) assign all your CMD tokens to Seize Initiative, Jump In or Tactical (secretly is fine); (2) everyone reveals their helms at once; (3) roll off for initiative.'],
    ['Seize Initiative', 'Before the initiative roll-off, spend tokens from here to roll a smaller die. Lowest roll wins.'],
    ['Roll-off die', '0 tokens: D12 · 1: D10 · 2: D8 · 3: D6 · 4+: D3. Tied CEOs roll off again.'],
    ['Initiative', 'The winner chooses which CEO acts first in the Jump Phase and again in the Tactical Phase. Play then goes clockwise.'],
    ['Restriction', 'Tokens placed here can only be used to Seize Initiative.'],
  ],
  jump: [
    ['Jump Phase', 'The CEO with initiative picks who goes first, then play goes clockwise. On your turn spend 1 Jump In token to deploy a jump point, deploy one battlegroup, or pass. With no tokens left you must pass. The phase ends when nobody has Jump In tokens.'],
    ['Requisition', 'Pay the combined cost of every ship in the battlegroup: up to 5 ships, all one class. Credits can go negative (deficit).'],
    ['Deploy a battlegroup', 'Choose a friendly jump point. Every ship must be within jump range (6−Ⓜ″) of it and within 3″ of another ship in the battlegroup.'],
    ['Deploy a jump point', 'Your first jump point on a table goes anywhere on that table. Later ones go within 3″ (jump range of Mass 3) of a friendly ship or jump point on that table. Alternatively, pick up and redeploy one of yours (each jump point at most once per round).'],
    ['Jump point limit', 'Number of tables + 1. Jump points are Mass 3, Silhouette 5, Shields 6 (errata).'],
    ['Jump Shock', 'After each ship arrives (jump in or jump-hop), every lower-Mass battlegroup within Ⓜ″ of it, friendly or enemy, suffers ⓂD6 damage-1 attacks (Shields save). Hits from several arriving ships are added together and saved as one attack.'],
    ['Limits', 'At most Ⓢ utility ships in play (counts individual ships, FAQ). No jumping in or placing jump points within 10″ of a planetoid.'],
  ],
  tac: [
    ['Tactical tokens', 'Can be spent on any Tactical command effect below. Spent tokens are discarded.'],
    ['Combined Orders', 'At the start of an activation, spend Ⓜ tokens (errata; Ⓜ of the active battlegroup) to also activate up to 3 unactivated friendly battlegroups wholly within Ⓜ+3″ of any of its ships. Their combined Ⓜ can’t exceed the active battlegroup’s combined Ⓜ. All of them do each step together, and the selected battlegroups can’t activate again this round. Once per activation.'],
    ['Power to Engines', 'At the start of a battlegroup’s movement step, spend 1 to double its Thrust for the rest of its activation. Once per activation.'],
    ['Power to Inertial Dampeners', 'At the start of a battlegroup’s movement step, spend 1 to let it fire primary weapons even after a High-G Manoeuvre this activation. Once per activation.'],
    ['Power to Weapon Systems', 'Before rolling an attack, spend up to Ⓜ tokens. Each one subtracts 1 from every die of one weapon system in that attack (minimum 1), so more dice hit and crit. Works outside your activation. Splitting attacks across targets needs separate tokens for each target.'],
    ['Power to Shields', 'When a battlegroup with Shields 1+ is attacked, after the attack dice are rolled, spend up to Ⓜ tokens for +1 Shields each, for that attack only. Works outside your activation.'],
    ['Executive Override', 'Any time in the Tactical Phase, spend 1 to re-roll a single die of any type.'],
    ['Go Rogue', 'Any time in the Tactical Phase, put 1 damage token on your own battlegroup to use one Tactical effect on that battlegroup as if you had a bonus token. At most once per activation, but any number of times per round.'],
  ],
};

// Damage (rulebook p.27, p.32)
const DAMAGE_RULES = 'When a battlegroup has damage tokens ≥ its Silhouette, a ship of your choice is destroyed and you discard tokens equal to its Silhouette. Repeat while enough tokens remain. Before removing a destroyed ship, roll a D6: on ≤ Ⓜ it explodes, hitting every battlegroup within Ⓜ″ with ⓂD6 damage-1 attacks (Shields save). More than Ⓜ damage tokens = systems critical.';
