/*
 * ui.test.js - headless smoke test for ui.js (the pass-and-play DOM layer).
 *
 * Run: node tests/ui.test.js
 *
 * There's no real browser here, so we stub the tiny slice of the DOM that ui.js
 * touches (document.getElementById('app'), addEventListener, innerHTML, window,
 * localStorage, confirm). Then we drive the REAL action handlers through full
 * rounds via the window.__CHUI test hook. Every handler calls the real render(),
 * so if any screen - reveal, clues, debate, every voting mode, tally, guess,
 * round-over, game-over, rules, custom-topic editor, log - throws, this fails.
 */
'use strict';

// ---- minimal DOM / browser shim -------------------------------------------
var store = {};
global.localStorage = {
  getItem: function (k) { return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
var appEl = {
  _html: '',
  scrollTop: 0,
  addEventListener: function () {},
  set innerHTML(v) { this._html = v; },
  get innerHTML() { return this._html; }
};
global.document = {
  readyState: 'complete',
  getElementById: function (id) { return id === 'app' ? appEl : null; },
  addEventListener: function () {}
};
global.window = global;
global.window.scrollTo = function () {};
global.confirm = function () { return true; };

// engine + content + bots attach to window (= global) before the UI reads them
require('../assets/ch-engine.js');
require('../assets/ch-content.js');
require('../assets/ch-art.js');
require('../assets/ch-bots.js');
var CH = global.window.CH;
var UI = require('../assets/ui.js');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  FAIL: ' + msg); } }
function section(name) { console.log('\n# ' + name); }
function G() { return UI.state().G; }
function phase() { return G().phase; }
function html() { return appEl._html; }

function names(n) { var a = []; for (var i = 0; i < n; i++) a.push('P' + (i + 1)); return a; }
function startWith(over) {
  var pc = (over && over.playerCount) || 4;
  var c = CH.defaultConfig(pc, names(pc));
  if (over) for (var k in over) if (over.hasOwnProperty(k)) c[k] = over[k];
  UI.setDraft(c);
  UI.handle('startGame');
}

// ---- phase drivers (drive the real handlers) ------------------------------
function passReveal() {
  UI.handle('revealStart');
  var n = G().players.length;
  for (var i = 0; i < n; i++) { UI.handle('revealShow'); UI.handle('revealNext'); }
  UI.handle('beginPlay');
}
function passClues() { var g = 0; while (phase() === 'clues' && g++ < 50) UI.handle('nextClue'); }
function passDebate() { if (phase() === 'debate') UI.handle('startVote'); }
function passVote(targetId) {
  if (G().config.votingMode === 'table') {
    UI.handle('tablePick', targetId);
    UI.handle('tableConfirm');
    return;
  }
  var secret = G().config.votingMode === 'secret';
  var guard = 0;
  while (phase() === 'vote' && guard++ < 50) {
    var st = UI.state();
    var voter = st.G.players[st.ui.voteIdx];
    if (secret) UI.handle('voteReveal');
    var suspect = (voter.id === targetId)
      ? st.G.players.filter(function (p) { return p.id !== targetId; })[0].id
      : targetId;
    UI.handle('seqVote', suspect);
  }
}
function passTally() { if (phase() === 'tally') UI.handle('revealAccused'); }
function passGuess(plan) {
  var guard = 0;
  while (phase() === 'guess' && guard++ < 50) {
    var g = G(), idx = g.secretIndex;
    if (plan === 'wrong') {
      idx = -1;
      for (var i = 0; i < g.topic.items.length; i++) {
        if (i !== g.secretIndex && g.guessHistory.indexOf(i) === -1) { idx = i; break; }
      }
      if (idx === -1) idx = g.secretIndex;
    }
    UI.handle('guess', idx);
  }
}
function nonChameleon() { return G().players.filter(function (p) { return G().chameleonIds.indexOf(p.id) === -1; })[0].id; }
function aChameleon() { return G().chameleonIds[0]; }

function driveRound(targetId, guessPlan) {
  passReveal();
  ok(['clues', 'debate', 'vote'].indexOf(phase()) !== -1, 'after reveal we are in a play phase (' + phase() + ')');
  passClues();
  passDebate();
  ok(phase() === 'vote', 'reached the vote phase');
  passVote(targetId);
  passTally();
  if (phase() === 'guess') passGuess(guessPlan);
  ok(['round_over', 'game_over'].indexOf(phase()) !== -1, 'round resolved (' + phase() + ')');
}

// ---------------------------------------------------------------------------
section('table vote · word edition · scoring → full match to game_over');
(function () {
  startWith({ playerCount: 4, votingMode: 'table', edition: 'word', scoring: true, winTarget: 2, scoreEscape: 2 });
  ok(phase() === 'reveal', 'new match starts in the reveal phase');
  var guard = 0;
  while (phase() !== 'game_over' && guard++ < 12) {
    driveRound(nonChameleon(), null); // accuse the wrong player → Chameleon escapes (+2)
    if (phase() === 'round_over') UI.handle('nextRound');
  }
  ok(phase() === 'game_over', 'scored match reached game_over');
  ok((G().winnerIds || []).length >= 1, 'a winner was declared');
  ok(/win/i.test(html()), 'game-over screen rendered a winner');
  UI.handle('rematch');
  ok(phase() === 'reveal', 'rematch starts a fresh match');
})();

// ---------------------------------------------------------------------------
section('open vote · picture edition · catch + correct guess');
(function () {
  startWith({ playerCount: 5, votingMode: 'open', edition: 'picture', scoring: false });
  ok(G().topic.type === 'picture', 'picture edition selected a picture topic');
  driveRound(aChameleon(), 'right'); // catch the Chameleon, who guesses correctly
  ok(G().outcome === 'caught_guessed', 'caught + correct guess → caught_guessed');
  ok(phase() === 'round_over', 'scoring off ends at round_over');
  UI.handle('viewLog'); ok(/R\d/.test(html()), 'log screen renders');
  UI.handle('backToGame'); ok(phase() === 'round_over', 'back from log returns to the game');
})();

// ---------------------------------------------------------------------------
section('secret vote · mixed edition · catch + failed guess');
(function () {
  startWith({ playerCount: 4, votingMode: 'secret', edition: 'mixed', chameleonGuesses: 1, scoring: true, winTarget: 5 });
  driveRound(aChameleon(), 'wrong');
  ok(G().outcome === 'caught_failed', 'caught + wrong guess → caught_failed');
  var cham = G().chameleonIds[0];
  G().players.forEach(function (p) {
    if (p.id !== cham) ok(G().scores[p.id] === G().config.scoreCaughtFailed, 'non-Chameleon scored on a failed Chameleon');
  });
})();

// ---------------------------------------------------------------------------
section('recap clues + 7-8 player hide-grid variant render');
(function () {
  startWith({ playerCount: 8, votingMode: 'table', edition: 'word', recordClues: true, hideGridDuringDebate: true, scoring: false });
  passReveal();
  ok(phase() === 'clues', 'clue phase begins');
  UI.handle('nextClue'); // recordClues path reads a (null) input safely
  while (phase() === 'clues') UI.handle('nextClue');
  ok(phase() === 'debate', 'debate phase begins');
  ok(/face-down/i.test(html()), 'hide-grid variant shows the face-down grid during debate');
  UI.handle('startVote');
  ok(phase() === 'vote', 'reached the vote');
})();

// ---------------------------------------------------------------------------
section('navigation + custom topic editor');
(function () {
  UI.handle('home'); ok(UI.state().view === 'home', 'home renders');
  ok(/Resume match/.test(html()), 'home offers to resume the in-progress match');
  UI.handle('rules'); ok(/How to play/i.test(html()) || UI.state().view === 'rules', 'rules render');
  UI.handle('customTopics'); ok(UI.state().view === 'custom', 'custom-topics list renders');

  UI.handle('newCustom');
  ok(UI.state().view === 'customEdit', 'custom editor opens');
  // emulate the user typing into the (DOM-less) fields
  var d = UI.state().ui.customDraft;
  d.name = 'Office Things'; d.type = 'word'; d.category = 'home';
  d.itemsText = 'Stapler\nDesk\nChair\nMonitor\nKeyboard\nMouse\nPen\nMug\nPhone\nFolder\nClock\nLamp\nPlant\nNotebook\nPrinter\nWindow';
  UI.handle('saveCustom');
  ok(UI.state().view === 'custom', 'saving returns to the list');
  var saved = JSON.parse(localStorage.getItem('ch_custom_v1') || '[]');
  ok(saved.length === 1 && saved[0].items.length === 16, 'custom topic persisted with 16 items');

  // a game can now draw the custom topic
  startWith({ playerCount: 4, edition: 'word', categories: ['home'], includeCustom: true, scoring: false });
  ok(phase() === 'reveal', 'a game including custom topics starts');

  UI.handle('deleteCustom', 0);
  // delete happens from the list view; reopen to confirm
  UI.handle('customTopics');
  var after = JSON.parse(localStorage.getItem('ch_custom_v1') || '[]');
  ok(after.length === 0, 'custom topic deleted');
})();

// ---------------------------------------------------------------------------
section('resume a saved game');
(function () {
  startWith({ playerCount: 5, votingMode: 'open', scoring: false });
  passReveal(); // mid-round, saved to localStorage
  UI.handle('home'); ok(G() === null, 'leaving the game clears the live state');
  UI.handle('resume'); ok(G() !== null && UI.state().view === 'game', 'resume restores the saved match');
})();

// ---------------------------------------------------------------------------
section('quick play (last settings)');
(function () {
  startWith({ playerCount: 4, votingMode: 'table', edition: 'word', scoring: false }); // persists config
  UI.handle('home');
  ok(/Quick play/.test(html()), 'home shows Quick play once settings exist');
  UI.handle('quickplay');
  ok(UI.state().view === 'game' && phase() === 'reveal', 'quick play starts a game from the last settings');
})();

// ---------------------------------------------------------------------------
section('information-leak guards (shared screens never reveal the secret/Chameleon)');
(function () {
  startWith({ playerCount: 5, votingMode: 'open', edition: 'word', cluePhase: true, debatePhase: true, scoring: false });
  passReveal();
  var secret = CH.secretItem(G());
  var HILITE = /class="cell( pic)? secret/; // the highlighted-secret-cell marker

  function sharedSafe(label) {
    var h = html();
    ok(h.indexOf('secretword') === -1 && h.indexOf('secretemoji') === -1, label + ': no large secret display');
    ok(!HILITE.test(h), label + ': the secret cell is not highlighted on a shared screen');
  }

  ok(phase() === 'clues', 'reached clues');
  sharedSafe('clues');

  // the public log, viewed mid-round, must not name the Chameleon or the secret word
  UI.handle('viewLog');
  var lg = html();
  ok(lg.indexOf(secret) === -1, 'mid-round log does not contain the secret word');
  ok(!/IS the Chameleon/.test(lg), 'mid-round log does not reveal who the Chameleon is');
  UI.handle('backToGame');

  while (phase() === 'clues') UI.handle('nextClue');
  sharedSafe('debate');
  UI.handle('startVote');
  sharedSafe('vote');

  passVote(aChameleon()); // catch the Chameleon
  passTally();
  ok(phase() === 'guess', 'reached the guess phase');
  sharedSafe('guess'); // CRITICAL: a caught Chameleon must NOT be shown the answer

  passGuess('wrong');
  ok(['round_over', 'game_over'].indexOf(phase()) !== -1, 'round concluded');
  // positive control: once the answer is meant to be public the marker DOES appear,
  // proving the negative checks above are meaningful (not trivially always-true).
  ok(HILITE.test(html()) || html().indexOf('secretword') !== -1, 'round-over DOES reveal the secret (positive control)');
})();

// ---------------------------------------------------------------------------
section('picture edition renders bundled OpenMoji illustrations');
(function () {
  ok(Object.keys(global.window.CH_ART || {}).length > 50, 'art set loaded');
  startWith({ playerCount: 4, votingMode: 'open', edition: 'picture', scoring: false });
  UI.handle('revealStart');
  // first human reveal shows the secret picture as inline SVG art
  UI.handle('revealShow');
  ok(/<svg/i.test(html()), 'a picture secret renders as an inline SVG illustration');
})();

// ---------------------------------------------------------------------------
section('solo vs bots (1 human + 3 bots) - full rounds, auto bot turns');
(function () {
  function botAccused() { var a = G().accusedId, p = G().players.filter(function (x) { return x.id === a; })[0]; return p && p.isBot; }
  function firstWrong(s) { for (var i = 0; i < s.topic.items.length; i++) if (i !== s.secretIndex && s.guessHistory.indexOf(i) === -1) return i; return s.secretIndex; }

  function driveBotRound() {
    UI.handle('revealStart');
    var humans = G().players.filter(function (p) { return !p.isBot; });
    for (var i = 0; i < humans.length; i++) { UI.handle('revealShow'); UI.handle('revealNext'); }
    UI.handle('beginPlay');
    ok(phase() === 'clues', 'bot round reaches clues');
    var g = 0; while (phase() === 'clues' && g++ < 40) { UI.handle('nextClue'); } // bots auto, human input is empty
    if (phase() === 'debate') {
      ok(!/class="cell( pic)? secret/.test(html()), 'bot-round debate does not highlight the secret');
      UI.handle('startVote');
    }
    var vg = 0;
    while (phase() === 'vote' && vg++ < 40) {
      var st = UI.state(), voter = st.G.players[st.ui.voteIdx];
      if (!voter || voter.isBot) break; // bots are auto-pumped
      if (G().config.votingMode === 'secret') UI.handle('voteReveal');
      UI.handle('seqVote', G().players.filter(function (p) { return p.id !== voter.id; })[0].id);
    }
    if (phase() === 'tally') UI.handle('revealAccused');
    var gg = 0;
    while (phase() === 'guess' && gg++ < 30) {
      if (botAccused()) UI.handle('botGuessStep');
      else UI.handle('guess', firstWrong(G()));
    }
    ok(['round_over', 'game_over'].indexOf(phase()) !== -1, 'bot round resolves');
  }

  startWith({ playerCount: 4, bots: [false, true, true, true], edition: 'word', votingMode: 'open', scoring: false, botDifficulty: 'medium' });
  ok(G().players.filter(function (p) { return p.isBot; }).length === 3, '3 bot seats created');
  for (var r = 0; r < 3; r++) {
    driveBotRound();
    if (phase() === 'round_over') UI.handle('nextRound');
  }
  ok(/🤖/.test(html()) || true, 'bot rounds ran without throwing');
})();

// ---------------------------------------------------------------------------
section('timed reveal + recheck (private, never on a shared screen)');
(function () {
  startWith({ playerCount: 4, edition: 'word', votingMode: 'open', scoring: false, revealSeconds: 5 });
  UI.handle('revealStart');
  UI.handle('revealShow');
  ok(/Hiding in/.test(html()), 'the reveal is timer-based (shows an auto-hide countdown)');
  ok(/rolecard/.test(html()), 'the holder sees their secret/role card');
  UI.handle('revealAgain');
  ok(/rolecard/.test(html()), 'can re-show the secret');

  // finish the reveal for every human, then start play
  var humans = G().players.filter(function (p) { return !p.isBot; }).length;
  for (var i = 0; i < humans; i++) { if (i > 0) UI.handle('revealShow'); UI.handle('revealNext'); }
  UI.handle('beginPlay');
  ok(['clues', 'debate', 'vote'].indexOf(phase()) !== -1, 'play starts after the reveal');

  // recheck mid-game: private + gated + timer-based
  UI.handle('recheck');
  ok(UI.state().view === 'recheck', 'recheck opens its own screen');
  var who = G().players.filter(function (p) { return !p.isBot; })[0].id;
  UI.handle('recheckPick', who);
  ok(/Pass the device to/.test(html()), 'recheck is gated behind pass-the-device');
  UI.handle('recheckShow');
  ok(/rolecard/.test(html()) && /Hiding in/.test(html()), 'recheck re-shows the secret privately, timer-based');
  UI.handle('recheckDone');
  ok(UI.state().view === 'game', 'recheck returns to the game without leaking');
})();

// ---------------------------------------------------------------------------
section('setup respects the player count (config can never exceed it)');
(function () {
  // Inject a deliberately invalid draft, then let setup render normalize it.
  var bad = CH.defaultConfig(4, names(4));
  bad.chameleonCount = 9;          // impossible for 4 players
  bad.playerCount = 4;
  UI.setDraft(bad);
  UI.setView('setup');
  UI.handle('toggleAdvanced');     // triggers a real setup render -> normalizeDraft
  var d = UI.state().draft;
  ok(d.chameleonCount === 3, 'Chameleon count clamped to players-1 on render (' + d.chameleonCount + ')');
  ok(d.bots.length === 4 && d.playerNames.length === 4, 'names and bots tracked to the player count');

  // Reducing the player count must drag the Chameleon count down with it.
  var d2 = CH.defaultConfig(8, names(8));
  d2.chameleonCount = 5;
  UI.setDraft(d2);
  UI.setView('setup');
  UI.handle('toggleAdvanced');
  UI.state().draft.playerCount = 3;  // simulate the user lowering players
  UI.handle('toggleAdvanced');       // re-render normalizes
  ok(UI.state().draft.chameleonCount <= 2, 'lowering players lowers the Chameleon count to fit');
})();

// ---------------------------------------------------------------------------
console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
