# Contributing

Thanks for your interest in improving this app! It's a small, dependency-light
codebase and contributions are welcome.

## Architecture (read this first)

The whole game ships as a **single inlined `assets/app.html`** loaded into a WebView.
You never edit `app.html` by hand — it is composed by `build.js` from source modules:

| File | Role |
|---|---|
| `assets/styles.css` | styling (inlined `<style>`) |
| `assets/ch-engine.js` | **pure** rules engine — no DOM, no network, deterministic (seeded RNG) |
| `assets/ch-content.js` | built-in topic library + bot clue knowledge (`BOT_CLUES`) |
| `assets/ch-art.js` | **generated** OpenMoji illustrations (see below) |
| `assets/ch-bots.js` | **pure** offline bot decisions (clue / bluff / vote / guess) |
| `assets/ui.js` | pass-and-play DOM UI |

Keep the engine and bot modules **pure and deterministic** so they stay unit-testable
and could be reused by a future networked build.

## Setup

```bash
npm install        # only needed to run the Expo app (not for tests/build)
```

Tests and the HTML build use **only Node's standard library** — no `npm install`
required to run them.

## Develop, test, build

```bash
npm test               # engine + bots + headless UI suites
npm run build:html     # compose assets/app.html from the source modules
npm start              # build:html, then expo start
npm run build:android  # build:html, then an EAS preview APK
```

`assets/app.html` is a build artifact and is git-ignored — regenerate it with
`npm run build:html`. `assets/ch-art.js` **is** committed (vendored OpenMoji art);
regenerate it only when picture topics change, with `node scripts/fetch-openmoji.js`
(needs network; Node 18+ for global `fetch`).

## Non-negotiable invariants (the tests enforce these)

1. **No hidden-info leaks.** The secret word/picture and who the Chameleon is must
   never appear on a shared screen — only on the private per-player reveal and at
   round-over. `tests/ui.test.js` has leak-regression guards.
2. **Bot clue knowledge is clean.** In `BOT_CLUES`, no clue word may equal another
   item in the same topic (it would mislead deduction), and every built-in topic must
   have a 16-entry clue set. `tests/bots.test.js` checks this.
3. **No game can hang or deadlock.** The engine is fuzzed across hundreds of full
   matches per configuration; tie-breakers are capped.
4. **Bots are additive.** Botless play must remain unchanged.

Please run `npm test` before opening a PR and add/adjust tests for your change.

## Style

- Plain ES5-ish JavaScript in the inlined modules (no build step beyond `build.js`).
- Match the surrounding code: 2-space indent, comments explaining *why*.
- See `.editorconfig`.

## Adding topics

Edit `assets/ch-content.js`: `w(id, name, category, [16 items])` for word topics,
`p(...)` for picture (emoji) topics. Add a matching 16-entry pool to `BOT_CLUES` so
bots can play it. For new picture emoji, run `node scripts/fetch-openmoji.js` to pull
their OpenMoji art. Then `npm test`.

## Commit / PR

- Keep commits focused; write a clear message.
- Describe the change and how you tested it in the PR.
- By contributing you agree your work is licensed under the project's MIT License.
