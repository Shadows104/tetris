# Changelog

All notable changes to Breaktime Games are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-08

### Added
- **Snake** as a second break-time game.
- The GM now picks the game (Tetris or Snake) in a dialog when starting a break, and everyone gets that game. The GM's last choice is the default.
- Macros can start a specific game with `game.modules.get("tetris").api.startBreak("snake")`.
- This changelog, linked from the module manifest. Release notes on GitHub now come from it.

### Changed
- Module renamed from "Breaktime Tetris" to **Breaktime Games**. The module id is still `tetris`, so existing installs keep working.
- Tetris is much faster: pieces fall a row every 550 ms at level 1 (was 1000 ms) and speed up about 20% per level, reaching 50 ms at level 12.
- The break screen, GM bar, notifications and settings now name the chosen game instead of always saying "Tetris".

## [0.1.3] - 2026-10-03

### Changed
- The scoreboard now shows each player's current score (**Now**) and their best score this break (**Best**) side by side, sorted by Best.

## [0.1.2] - 2026-10-03

### Added
- **"I'm ready to continue"** button for players. Everyone sees a "2/3 players ready" count and a ✓ next to ready players, and the GM gets a notification when all players are ready.
- The GM can step away from Tetris during a break with **Back to Foundry**. A small break bar shows the ready count, a **Scores** dropdown, **Play Tetris** and **End Break**.
- GM setting **"Open Tetris when a break starts"**. Turn it off to stay in Foundry when a break starts.

### Changed
- **Ctrl+Shift+B** now starts a break, and during a break it opens or closes the GM's own board instead of ending the break.
- The toolbar mug is hidden during a break, so a break can only be ended with an **End Break** button.

### Fixed
- Players who reload or join mid-break now see everyone's scores straight away, including players whose game has already ended.

## [0.1.1] - 2026-10-03

### Changed
- Tetris points are only awarded for completed rows. Soft and hard drops no longer add points.

## [0.1.0] - 2026-10-03

### Added
- First release. The GM starts a break from the toolbar mug or **Ctrl+Shift+B**. Foundry pauses and every player gets a game of Tetris with hold, next-piece preview, ghost piece and levels.
- Live scoreboard of everyone's scores during the break.
- The GM ends the break with **End Break**. The Tetris screen closes for everyone and Foundry unpauses unless it was already paused before the break.

[Unreleased]: https://github.com/Shadows104/tetris/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Shadows104/tetris/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/Shadows104/tetris/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Shadows104/tetris/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Shadows104/tetris/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Shadows104/tetris/releases/tag/v0.1.0
