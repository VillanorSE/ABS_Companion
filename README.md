# A Billion Suns Companion

An unofficial mobile companion for the tabletop game *A Billion Suns*: a campaign tracker, an in-game battle tracker, and ship reference cards.

Open the GitHub Pages site on your phone and choose **Add to Home Screen** to install it. It works offline, and your campaign is saved on the device. Use **Overview → Export backup** to move a campaign between devices.

- **Overview**: corporation details and campaign status, rivals and standings, notes and backup/import. Capital and reputation are calculated from the log and unlocks. Use **Share my corporation** to send rivals a file they can add, which also lets them view your fleet's stats.
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

The **Rules** button (top bar) searches `glossary.js`: short unofficial summaries with rulebook page numbers, for the group's own use alongside the rulebook. Battle also tracks contract cards left and exhaustion (with the game-end check) and keeps the screen awake during games. The Log has campaign stats and game photos (stored on the device and included in backups). Overview can print the campaign sheet or save it as a PDF.

Rules text in `rules.js` is paraphrased from the rulebook, with FAQ v1.2 and Warzone errata applied. It is not copied verbatim. Contract cards in `contracts.js` come from the group's contract reference cards.

`ABS_Campaign_Tracker.html` is the printable tracker. A filled-in "Save a copy" file from it can be imported into the app.

When you change app files, bump the version (e.g. 0.11.0 → 0.12.0) in both `sw.js` (`VERSION`) and `app.js` (`APP_VERSION`) so installed copies update.
