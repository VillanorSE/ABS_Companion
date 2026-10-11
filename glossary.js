// Rules lookup: short, unofficial summaries written in our own words, each pointing to the
// rulebook page (FAQ v1.2 and Warzone errata noted where they apply). They are reminders,
// not a substitute for the rulebook: check the page for the full rule.
const GLOSSARY_NOTE = 'Unofficial summaries for our group’s use: reminders, not the rules themselves. When in doubt, check the rulebook page.';

const GLOSSARY = [
  // Core concepts
  { t: 'Dice: lower is better', p: 12, k: 'roll success', d: 'In A Billion Suns low rolls are good: you hit by rolling at or under a target number.' },
  { t: 'Dud', p: 12, k: 'max natural highest malfunction', d: 'A die showing its highest face (6 on a D6, 8 on a D8, and so on) is a dud and always fails, even if it would otherwise succeed. Only natural rolls are duds; modifiers never create or remove one. Duds can be re-rolled if you have a re-roll.' },
  { t: 'Re-rolls', p: 12, k: 'reroll', d: 'A die may be re-rolled more than once if you have several re-roll effects, even if it already succeeded. You always keep the new result, and you can only re-roll your own dice.' },
  { t: 'Roll-off', p: 12, k: 'tie initiative d12', d: 'Each CEO involved rolls a D12 and the lowest wins. Tied CEOs roll off again.' },
  { t: 'Rounding and D3', p: 14, k: 'half round up d3', d: 'When dividing the Scale (Ⓢ/2, Ⓢ/3), always round up. A D3 is a D6 halved, rounding up.' },
  { t: 'Scale (Ⓢ)', p: 14, k: 'size game', d: 'A whole number from 1 to 10 agreed before the game. Rules marked Ⓢ use it, and it sets contract deck sizes, CMD tokens (Ⓢ+3) and the utility ship limit.' },
  { t: 'Mass (Ⓜ)', p: 11, k: 'm', d: 'Each ship class’s Mass. Rules marked Ⓜ use it: jump range (6−Ⓜ″), Jump Shock, explosions, mother’s wing, systems critical, and how many tokens Power to Weapons or Shields can take.' },
  { t: 'Simultaneous effects', p: 14, k: 'order timing', d: 'If several effects happen at once, the active CEO picks the order. If no CEO is active, roll off and the winner picks.' },
  { t: 'Credits, deficit and profit', p: 14, k: 'money vp victory points', d: 'Credits start at 0. Requisitions lower them and revenue raises them. Going negative is allowed (deficit); positive is profit.' },
  { t: 'Victory', p: 17, k: 'win winner result table', d: 'Highest credits wins. The victory table rates the result: highest credits and in profit is a resounding success; highest but in deficit is questionable; not highest but in profit is acceptable; neither is a firing offence.' },
  { t: 'Game end', p: 17, k: 'exhausted finish over', d: 'The game ends at the end of a round in which two or more contracts are exhausted. There is no fixed round limit.' },

  // Round structure
  { t: 'Round structure', p: 15, k: 'phases order', d: 'Command Phase → Jump Phase → Tactical Phase (alternating activations) → End Phase.' },
  { t: 'Command Phase and initiative', p: 27, k: 'helm cmd tokens seize', d: 'Assign all CMD tokens to the helm, reveal helms together, then roll off for initiative (Seize Initiative tokens shrink your die). The winner picks who acts first in the Jump and Tactical Phases.' },
  { t: 'End Phase', p: 17, k: 'score revenue clear', d: 'Score contracts that score in the End Phase, discard all CMD tokens from helms, then check whether two or more contracts are exhausted.' },
  { t: 'Activation', p: 18, k: 'tactical steps', d: 'Each battlegroup activates once per round: Issue Orders → Movement → Passive Attacks (enemies shoot it) → Jump Out → Active Attacks → Scan. All its ships activate together.' },
  { t: 'Active and passive', p: 20, k: 'active battlegroup ceo', d: 'The battlegroup activating, and its CEO, are active. Everyone and everything else is passive.' },

  // Orders
  { t: 'Vector (order)', p: 20, k: 'move twice', d: 'Each ship may take a second move action right after its first.' },
  { t: 'Engage (order)', p: 20, k: 'engage target reroll', d: 'Nominate one object or enemy battlegroup in the primary arc of any of your ships (any range) as the Engage Target. Re-roll missed attack dice against it once. If you attack with primaries, they must target it if possible; if they can’t, the primary attacks are wasted.' },
  { t: 'Red Alert (order)', p: 20, k: 'repair remove damage', d: 'At the end of the movement step, remove D3 damage tokens from the battlegroup.' },
  { t: 'Jump Out (order)', p: 20, k: 'leave flee', d: 'In the Jump Out Step, if every ship is within jump range of a friendly jump point, remove the battlegroup and its tokens. Its ships are not destroyed, but bringing them back means requisitioning and paying again.' },

  // Movement
  { t: 'Move action', p: 20, k: 'pivot thrust movement', d: 'Pivot any amount on the spot, then move straight ahead up to Thrust. Each ship moves individually and may move less than full Thrust.' },
  { t: 'High-G Manoeuvre', p: 21, k: 'pivot 90 primary', d: 'A ship that pivots more than 90° in a single pivot can’t fire its primary weapons this activation (unless it uses Power to Inertial Dampeners).' },
  { t: 'Coherency', p: 21, k: 'chain 3 inch', d: 'After moving, the battlegroup’s ships must form a chain with no more than 3″ between one ship and the next (errata). If not, it takes 1 damage token per ship.' },
  { t: 'Table edges and overlapping', p: 21, k: 'edge stop bases', d: 'A ship touching a table edge stops. Ships ignore each other when moving and may overlap if stable, but no two centrepoints may share a spot.' },
  { t: 'Easy Target', p: 31, k: 'slow half thrust token', d: 'A battlegroup in which any ship moved less than half its Thrust (and that didn’t jump in or jump-hop) gets an Easy Target token. Enemies may re-roll attack dice once against it (errata removed “missed”). Discard the token at the start of its next activation.' },
  { t: 'Jump-hop', p: 31, k: 'hop jump point', d: 'Once per activation, at the start or end of the movement step, if every ship is within jump range of a jump point, redeploy the battlegroup within jump range of another friendly jump point on any table. Tokens stay; no new requisition. It causes Jump Shock at the destination.' },

  // Jumping
  { t: 'Jump range', p: 17, k: '6-m deploy', d: '6−Ⓜ″ for the battlegroup or jump point being placed (jump points are Mass 3, so 3″).' },
  { t: 'Jump points', p: 17, k: 'jump point limit', d: 'Mass 3, Silhouette 5, Shields 6 (Warzone errata). Limit: number of tables + 1. Your first on a table goes anywhere; later ones within 3″ of a friendly ship or jump point on that table. Any jump point in dangerous space is destroyed in the End Phase.' },
  { t: 'Requisitioning', p: 18, k: 'buy cost battlegroup', d: 'Pay the combined cost of every ship in the battlegroup (up to 5 ships of one class), then deploy every ship within jump range of a friendly jump point and within 3″ of another of its ships.' },
  { t: 'Jump Shock', p: 31, k: 'arrival damage', d: 'After each ship arrives (jump in or jump-hop), every lower-Mass battlegroup within Ⓜ″ of it, friendly or enemy, suffers ⓂD6 damage-1 attacks (Shields save). Several arriving ships add their hits into one attack.' },

  // Combat
  { t: 'Arcs of fire', p: 24, k: 'primary auxiliary 45 180', d: 'Primary weapons fire in a 45° arc to the front; auxiliary weapons in a 180° arc to the front (errata wording).' },
  { t: 'Range', p: 24, k: 'minimum maximum', d: 'The target must be no closer than the weapon’s minimum and no further than its maximum range.' },
  { t: 'Valid targets', p: 25, k: 'target silhouette friendly table', d: 'A target must have a Silhouette, not be friendly, have at least one of its ships in range and arc of at least one attacking ship, and be on the same table. Line of sight is always clear.' },
  { t: 'Primary and auxiliary targets', p: 25, k: 'split dice declare', d: 'Declare all targets before rolling. Primary weapons all go at one primary target. Auxiliary dice can be split across any number of targets, declared before rolling. Each target is resolved as one attack.' },
  { t: 'Passive attacks', p: 21, k: 'auxiliary return fire', d: 'After the active battlegroup moves, each passive battlegroup or object with it in auxiliary range and arc may attack it once with auxiliary weapons. Passive CEOs go clockwise from the active CEO’s left.' },
  { t: 'Attack sequence', p: 26, k: 'hit save damage', d: 'Roll attack dice; hits are rolls at or under the target’s Silhouette. Re-roll if allowed, discard misses and duds, add a bonus hit per critical. The target saves each hit with the same die type, cancelling on rolls at or under its Shields (duds never save). Each unsaved hit deals the weapon’s damage.' },
  { t: 'Critical hit', p: 26, k: 'crit 1 bonus', d: 'Each attack die that rolls a 1 adds a bonus hit of the same weapon. With Power to Weapon Systems, higher rolls can become 1s and crit.' },
  { t: 'Damage and destroyed ships', p: 27, k: 'damage tokens silhouette kill', d: 'Damage tokens go on the battlegroup. Once it has tokens equal to or above its Silhouette, its controller picks a ship to destroy and discards tokens equal to the Silhouette, repeating while enough remain.' },
  { t: 'Systems critical and weapon malfunctions', p: 32, k: 'malfunction dud damage', d: 'A battlegroup with more than Ⓜ damage tokens is systems critical. When it attacks, every dud (after re-rolls) gives it damage equal to that weapon’s damage, with no saves. Finish the attack before removing ships.' },
  { t: 'Explosions', p: 32, k: 'explode destroyed', d: 'Before removing a destroyed ship, roll a D6. On a roll at or under its Ⓜ it explodes: every battlegroup within Ⓜ″ suffers ⓂD6 damage-1 attacks (Shields save).' },
  { t: 'Mother’s wing', p: 32, k: 'shields protect heavier', d: 'If every ship in a battlegroup is within Ⓜ″ of a ship in a heavier friendly battlegroup, it may use that battlegroup’s Shields instead of its own. Passive CEOs may also use it to protect independent ships and facilities.' },

  // Space and objects
  { t: 'Scanning', p: 22, k: 'scan 3 inch', d: 'In the Scan Step the battlegroup may scan one object or ship within 3″ of any of its ships, in any direction, for a single declared purpose. Scans only matter to contracts and special rules.' },
  { t: 'Dangerous space', p: 35, k: 'terrain debris', d: 'A ship that moves through, or stays still in, dangerous space makes its battlegroup suffer ⓂD6 damage-1 attacks at the end of its movement step (several ships combine into one attack).' },
  { t: 'Objects', p: 36, k: 'stationary asteroid facility', d: 'Objects with a Silhouette can be attacked and Engaged. Stationary objects never move. Objects don’t block movement. They save with their Shields but can never use Power to Shields.' },
  { t: 'Independent ships', p: 37, k: 'civilian criminal lifeboat uncontrolled', d: 'They start under no CEO’s control. One CEO rolls their dice but can’t spend CMD tokens on them. Uncontrolled ones must make passive attacks if able, and any CEO may roll them (FAQ). Once controlled, each acts as its own battlegroup in that fleet.' },
  { t: 'Planetoids and gravity wells', p: 37, k: 'planetoid 10 inch', d: 'A 4″–12″ stationary object with no Silhouette whose area is dangerous space. No jump points or jumping in within 10″. A battlegroup with any ship within 10″ can’t jump-hop or jump out.' },
  { t: 'Tokens', p: 37, k: 'carry cargo', d: 'Battlegroups can carry any number of tokens unless a rule says otherwise. All tokens are lost if the battlegroup is destroyed, and carried tokens can’t be scanned.' },
  { t: 'Utility ships', p: 34, k: 'limit mining laser', d: 'At most Ⓢ utility ships in play, counting individual ships (FAQ). The Medium Utility Ship’s Mining Laser can only target stationary objects.' },
  { t: 'Carriers', p: 35, k: 'scramble re-embark', d: 'Once per round at the start of its activation, each Carrier may scramble one battlegroup of Mass 0 ships or Light Utility Ships within its jump range, with a free Combined Order that round. Those battlegroups may treat friendly Carriers as jump points for jumping out. Carriers are not jump points (FAQ).' },

  // Contracts
  { t: 'Contract decks', p: 38, k: 'suit build deck cards', d: 'Each contract uses the lowest Ⓢ cards of its suit. ♠ ascending, face up; ♥ descending, face up; ♣ and ♦ shuffled, face down. Aces count as 1.' },
  { t: 'Draw, discard and reveal', p: 38, k: 'hand reveal card', d: 'Draw: take the top card secretly. Discard: face up on that contract’s pile. Reveal: the top card, or a card of that suit from your hand; if the deck is empty you may make a CEO holding cards reveal one of their choice.' },
  { t: 'Revenue', p: 40, k: 'score credits ceos', d: 'A scored card is worth its face value × the number of CEOs (e.g. a 2 is worth 4 credits in a two-player game).' },
  { t: 'Exhausted contracts', p: 41, k: 'exhaust end', d: 'A contract is exhausted when no more revenue can be scored from it, whether all its cards are gone or scoring is no longer possible. Two or more exhausted at the end of a round ends the game.' },
];
