# A Billion Suns Companion

An unofficial mobile companion for the tabletop game *A Billion Suns*: a campaign tracker, an in-game battle tracker, and ship reference cards.

Open the GitHub Pages site on your phone and choose **Add to Home Screen** to install it. It works offline, and your campaign is saved on the device. Use **Overview → Export backup** to move a campaign between devices.

- **Overview**: corporation details and campaign status, rivals and standings, notes and backup/import. Capital and reputation are calculated from the log and unlocks. Rivals can join an **online campaign** by code (see setup below) or swap files with **Share my corporation**; either way you can view each other's fleet stats.
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

## Online campaigns (one-time setup)

Online campaigns use a free Google Firebase project that the group owns. Until it's set up, the app works the same but only offers sharing by file.

1. Go to https://console.firebase.google.com, sign in with a Google account and **Create a project** (any name, e.g. `abs-companion`). Google Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
3. **Build → Firestore Database → Create database** → pick a location near you → **Start in production mode**.
4. In Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules` from this repo, and **Publish**.
5. **Project settings** (gear icon) → **Your apps** → the web icon `</>` → register an app (any nickname, no hosting). Copy `apiKey` and `projectId` from the config it shows into `sync-config.js`.

Then commit and push. One player taps **Overview → Rivals → Start online campaign** and shares the code; everyone else taps **Join** with that code.

How it works: each corporation is one document under `campaigns/{code}/corps/`. Phones sign in anonymously, so nobody needs an account. Anyone who knows the code can read that campaign, but only the phone that created a corporation can change or remove it. The sign-in travels with **Export backup**, so moving to a new phone keeps your corporation. Firebase's free tier is far more than a gaming group needs.

`ABS_Campaign_Tracker.html` is the printable tracker. A filled-in "Save a copy" file from it can be imported into the app.

When you change app files, bump the version (e.g. 0.11.0 → 0.12.0) in both `sw.js` (`VERSION`) and `app.js` (`APP_VERSION`) so installed copies update.
