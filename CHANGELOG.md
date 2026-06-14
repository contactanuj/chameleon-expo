# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-06-14

### Added
- Greatly expanded the word library — 24 new topics (Vegetables, Breakfast, Desserts,
  Fast Food, Birds, Bugs, Flowers, Trees, Landscapes, Mythical Creatures, Music Genres,
  Dance Styles, Games, Hobbies, Accessories, Tools, Colours, Shapes, Gemstones, Camping,
  Bathroom, Office, Body Organs, The Garden) — each with curated bot clue knowledge.
  Now 46 word + 8 picture topics.

### Changed
- Hardened player-count/configuration integrity: the setup normalizes the draft on every
  change so the Chameleon count always stays 1…players−1; the engine defensively clamps it
  too. Engine fuzz now covers 2–12 players.

## [1.0.0] - 2026-06-14

### Added
- Pass-and-play game of The Chameleon for one device (Expo + WebView).
- **Word edition** and **Picture edition** (bundled OpenMoji illustrations) plus a
  **Mixed** mode and on-device **custom topics**.
- Pure, deterministic, unit-tested rules engine (`ch-engine.js`).
- Full round flow: private reveal, clues, debate, voting, the catch, the Chameleon's
  guess, and optional scoring to a configurable target.
- **Bots** (`ch-bots.js`): offline, deterministic seat-fillers / solo practice with
  easy/medium/hard difficulty; curated clue knowledge for every built-in topic.
- Extensive configuration with live validation: players, Chameleon count, clue/debate
  phases, hide-grid (7–8 player) variant, voting modes (table/open/secret),
  tie-breakers (capped re-vote), guesses (auto two at three players), scoring values,
  dealer rotation, optional clue/debate timers, grid coordinates.
- Safe-area handling so the status bar / notch never overlaps the content.
- Test suites: engine fuzzing, bot clue-invariant + competence, and a headless UI
  drive with information-leak regression guards.

[Unreleased]: https://github.com/contactanuj/chameleon-expo/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/contactanuj/chameleon-expo/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/contactanuj/chameleon-expo/releases/tag/v1.0.0
