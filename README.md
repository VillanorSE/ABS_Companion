# A Billion Suns Companion

An unofficial mobile companion for the tabletop game *A Billion Suns*: a campaign tracker, an in-game battle tracker, and ship reference cards.

Open the GitHub Pages site on your phone and choose **Add to Home Screen** to install it. It works offline, and your campaign is saved on the device. Use **Overview → Export backup** to move a campaign between devices.

- **Overview**: corporation details and campaign status, plus notes and backup/import. Capital and reputation are calculated from the log and unlocks.
- **Battle**: in-game tracker with:
  - the contracts in play and their full reference cards;
  - round and scale;
  - the command helm (Seize Initiative / Jump In / Tactical tokens, each with expandable rules);
  - credits ledger;
  - battlegroup requisitions with damage and ship-loss tracking.

  Use "Finish game → Log" to record the result.
- **Stats**: stat cards for your unlocked ships, or toggle to show all ships.
- **Unlocks**: ship classes (tap a name for its stats) and competitive advantages (tap ⌄ for full rules).
- **Log**: per-game log.

Rules text in `rules.js` is paraphrased from the rulebook, with FAQ v1.2 and Warzone errata applied. It is not copied verbatim. Contract cards in `contracts.js` come from the group's contract reference cards.

`ABS_Campaign_Tracker.html` is the printable tracker. A filled-in "Save a copy" file from it can be imported into the app.

When you change app files, bump `VERSION` in `sw.js` so installed copies update.
