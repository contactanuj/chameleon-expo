/*
 * bots.test.js — bot clue knowledge + offline bot decisions (ch-bots.js).
 *
 * Run: node tests/bots.test.js
 *
 * Covers:
 *   - BOT_CLUES integrity: parallel to items, non-empty, and the key INVARIANT —
 *     no clue equals the secret itself or any OTHER item in the same topic.
 *   - decisions: clue picking, the suspicion model (competent AND fair), votes,
 *     guesses — all valid and sensible.
 *   - "not duds": with a clearly-off Chameleon clue, bots catch it.
 *   - "fair": a perfect in-pool bluff is judged innocent (so a human can escape).
 *   - fuzz: hundreds of full all-bot and mixed bot+human matches terminate cleanly
 *     with no throws, only bot-supported topics, and invariants intact.
 */
'use strict';

var CH = require('../assets/ch-engine.js');
var CONTENT = require('../assets/ch-content.js');
var CHBOT = require('../assets/ch-bots.js');
var LIB = CONTENT.TOPICS;

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  FAIL: ' + msg); } }
function section(n) { console.log('\n# ' + n); }
function makeRng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function ri(rng, n) { return Math.floor(rng() * n); }
function names(n) { var a = []; for (var i = 0; i < n; i++) a.push('P' + (i + 1)); return a; }
function norm(w) { return ('' + w).trim().toLowerCase(); }

// ---------------------------------------------------------------------------
section('bot clue knowledge integrity');
(function () {
  var withClues = LIB.filter(function (t) { return t.botClues; });
  ok(withClues.length === LIB.length, 'every built-in topic has bot clues (' + withClues.length + '/' + LIB.length + ')');
  withClues.forEach(function (t) {
    ok(t.botClues.length === t.items.length, t.id + ': clue pools parallel to items');
    var items = t.items.map(norm);
    var clean = true, collide = false, selfRef = false;
    for (var i = 0; i < t.botClues.length; i++) {
      var pool = t.botClues[i];
      if (!Array.isArray(pool) || pool.length < 2) clean = false;
      for (var j = 0; j < (pool || []).length; j++) {
        var w = norm(pool[j]);
        if (!w) clean = false;
        if (w === items[i]) selfRef = true;                 // clue == its own secret
        var k = items.indexOf(w);
        if (k !== -1 && k !== i) collide = true;            // clue == a DIFFERENT item
      }
    }
    ok(clean, t.id + ': every pool has >=2 non-empty clues');
    ok(!selfRef, t.id + ': no clue equals its own secret');
    ok(!collide, t.id + ': no clue equals another item in the topic (would mislead deduction)');
  });
})();

// ---------------------------------------------------------------------------
section('suspicion model (competent + fair)');
(function () {
  var t = CONTENT.byId.food, pools = t.botClues;
  var secret = 14; // "Chicken"
  // a word from the secret's own pool -> innocent (so a good bluff/clue is safe)
  ok(CHBOT._suspicion(pools[secret][0], secret, pools) === 0, 'in-secret-pool clue reads as innocent (fairness)');
  // a word clearly from another cell -> suspicious
  ok(CHBOT._suspicion(pools[0][0], secret, pools) === 0.7, 'a clearly other-cell clue reads as suspicious');
  // an unknown free-text word -> uncertain, NOT damning (fair to humans)
  ok(CHBOT._suspicion('zxqwerty', secret, pools) === 0.35, 'an unknown word is only mildly suspicious (not auto-guilty)');
  ok(CHBOT._genericWords(pools).length > 0, 'generic bluff words can be derived');
})();

// helper: build a started game with a chosen chameleon seat
function gameWith(pc, over, seed) {
  var c = CH.defaultConfig(pc, names(pc));
  if (over) for (var k in over) if (over.hasOwnProperty(k)) c[k] = over[k];
  return CH.newGame(c, LIB, seed || 1);
}

// ---------------------------------------------------------------------------
section('bot decisions are valid');
(function () {
  var s = gameWith(5, { bots: [true, true, true, true, true], edition: 'word', botDifficulty: 'hard' }, 42);
  ok(!!s.topic.botClues, 'a bot game only draws bot-supported topics');
  CH.beginClues(s);
  // every bot gives a clue; a knower's clue is in the secret's pool
  var guard = 0;
  while (s.phase === 'clues' && guard++ < 30) {
    var giver = CH.currentClueGiver(s);
    var clue = CHBOT.decideClue(s, giver);
    ok(typeof clue === 'string' && clue.length > 0, 'clue is a non-empty string');
    if (s.chameleonIds.indexOf(giver) === -1) {
      ok(s.topic.botClues[s.secretIndex].map(norm).indexOf(norm(clue)) !== -1, 'a knowing bot clues from the secret pool');
    }
    CH.nextClue(s, clue);
  }
  // votes valid (never self)
  if (s.phase === 'debate') CH.beginVote(s);
  s.players.forEach(function (p) {
    var v = CHBOT.decideVote(s, p.id);
    ok(CH.getPlayer(s, v) && v !== p.id, 'vote targets a real other player');
  });
})();

// ---------------------------------------------------------------------------
section('not duds: a clearly-off Chameleon gets caught');
(function () {
  // Force a scenario: chameleon says a word clearly from a wrong cell; everyone
  // else clues correctly from the secret pool. A hard non-cham bot must accuse it.
  var s = gameWith(5, { bots: [true, true, true, true, true], edition: 'word', botDifficulty: 'hard' }, 7);
  var pools = s.topic.botClues, sec = s.secretIndex;
  var secWords = pools[sec].map(norm);
  // a clearly-off clue: a word from another cell that is NOT also in the secret pool
  var offWord = 'zzqqxx';
  for (var c = 0; c < pools.length && offWord === 'zzqqxx'; c++) {
    if (c === sec) continue;
    for (var wi = 0; wi < pools[c].length; wi++) { if (secWords.indexOf(norm(pools[c][wi])) === -1) { offWord = pools[c][wi]; break; } }
  }
  var cham = s.chameleonIds[0];
  s.phase = 'vote'; s.votes = {};
  s.players.forEach(function (p) {
    s.clues[p.id] = (p.id === cham) ? offWord : pools[sec][0];
  });
  var detector = s.players.filter(function (p) { return p.id !== cham && s.chameleonIds.indexOf(p.id) === -1; })[0];
  ok(CHBOT.decideVote(s, detector.id) === cham, 'a hard bot accuses a clearly-off Chameleon');
})();

// ---------------------------------------------------------------------------
section('competence over many rounds (bots beat random)');
(function () {
  // All-bot single rounds: how often does the table land on the real Chameleon?
  var pc = 5, rounds = 300, caught = 0;
  for (var g = 0; g < rounds; g++) {
    var s = gameWith(pc, { bots: [true, true, true, true, true], edition: 'word', botDifficulty: 'medium' }, g * 131 + 5);
    CH.beginClues(s);
    var gd = 0; while (s.phase === 'clues' && gd++ < 30) CH.nextClue(s, CHBOT.decideClue(s, CH.currentClueGiver(s)));
    if (s.phase === 'debate') CH.beginVote(s);
    var vg = 0;
    while (s.phase === 'vote' && vg++ < 10) {
      s.players.forEach(function (p) { CH.castVote(s, p.id, CHBOT.decideVote(s, p.id)); });
      CH.resolveVotes(s);
    }
    if (s.accusedId && s.chameleonIds.indexOf(s.accusedId) !== -1) caught++;
  }
  var rate = caught / rounds, baseline = 1 / pc;
  console.log('  chameleon caught rate ' + (rate * 100).toFixed(0) + '% vs random ' + (baseline * 100).toFixed(0) + '%');
  ok(rate > baseline * 1.4, 'bots catch the Chameleon clearly more than random (competent, not duds)');
  ok(rate < 0.98, 'but a bluffing Chameleon still escapes sometimes (fun, not deterministic)');
})();

// ---------------------------------------------------------------------------
section('fuzz: full bot + mixed matches terminate cleanly');

function simHumanClue(s, id, rng) {
  var pools = s.topic.botClues;
  if (s.chameleonIds.indexOf(id) === -1 && pools) return pools[s.secretIndex][ri(rng, pools[s.secretIndex].length)];
  if (pools) { var c = ri(rng, pools.length); return pools[c][ri(rng, pools[c].length)]; }
  return 'thing';
}
function randOther(s, id, rng) { var o = s.players.filter(function (p) { return p.id !== id; }); return o[ri(rng, o.length)].id; }

function playMatch(cfg, seed) {
  var rng = makeRng(seed * 40503 + 7);
  var s = CH.newGame(cfg, LIB, seed);
  var mg = 0;
  while (s.phase !== 'game_over' && mg++ < 300) {
    ok(!!s.topic.botClues, cfg.label + ': bot match uses a bot-supported topic');
    ok(s.chameleonIds.length === cfg.chameleonCount, cfg.label + ': chameleon count preserved');
    CH.beginClues(s);
    var cg = 0;
    while (s.phase === 'clues' && cg++ < 40) {
      var giver = CH.currentClueGiver(s);
      var word = CH.isBotSeat(s.config, +giver.slice(1)) ? CHBOT.decideClue(s, giver) : simHumanClue(s, giver, rng);
      CH.nextClue(s, word);
    }
    if (s.phase === 'debate') CH.beginVote(s);
    var vg = 0;
    while (s.phase === 'vote' && vg++ < 20) {
      s.players.forEach(function (p) {
        var isBot = CH.isBotSeat(s.config, +p.id.slice(1));
        CH.castVote(s, p.id, isBot ? CHBOT.decideVote(s, p.id) : randOther(s, p.id, rng));
      });
      CH.resolveVotes(s);
    }
    if (s.phase === 'tally') CH.revealAccused(s);
    var gg = 0;
    while (s.phase === 'guess' && gg++ < 30) {
      var acc = s.accusedId;
      var idx = CH.isBotSeat(s.config, +acc.slice(1)) ? CHBOT.decideGuess(s, acc) : (function () {
        var avail = []; for (var i = 0; i < s.topic.items.length; i++) if (s.guessHistory.indexOf(i) === -1) avail.push(i); return avail[ri(rng, avail.length)];
      })();
      CH.chameleonGuess(s, idx);
    }
    ok(['round_over', 'game_over'].indexOf(s.phase) !== -1, cfg.label + ': round resolved');
    ok(!!s.outcome, cfg.label + ': outcome recorded');
    if (s.phase === 'round_over') { if (!cfg.scoring && s.round >= 8) break; CH.nextRound(s, LIB); }
  }
  if (cfg.scoring) ok(s.phase === 'game_over', cfg.label + ': scored bot match ended');
  return s;
}

var combos = [];
['word', 'picture', 'mixed'].forEach(function (ed) {
  ['easy', 'medium', 'hard'].forEach(function (df) {
    combos.push({ label: 'allbot-' + ed + '-' + df, pc: 5, bots: [true, true, true, true, true], edition: ed, botDifficulty: df });
  });
});
combos.push({ label: 'solo-1h4b', pc: 5, bots: [false, true, true, true, true], edition: 'word' });
combos.push({ label: 'mixed-2h3b', pc: 5, bots: [false, false, true, true, true], edition: 'mixed' });
combos.push({ label: '3p-2guess', pc: 3, bots: [true, true, true], edition: 'word' });
combos.push({ label: '2cham-bots', pc: 6, bots: [true, true, true, true, true, true], edition: 'word', chameleonCount: 2 });
combos.push({ label: 'noscore-bots', pc: 4, bots: [false, true, true, true], edition: 'word', scoring: false });

var matches = 0, errored = 0;
combos.forEach(function (combo) {
  var base = CH.defaultConfig(combo.pc, names(combo.pc));
  for (var k in combo) if (combo.hasOwnProperty(k) && k !== 'pc' && k !== 'label') base[k] = combo[k];
  base.label = combo.label;
  for (var g = 0; g < 20; g++) {
    matches++;
    try { playMatch(base, matches * 6151 + g + 1); }
    catch (e) { errored++; ok(false, combo.label + ' threw: ' + e.message); }
  }
});
console.log('  played ' + matches + ' bot/mixed matches across ' + combos.length + ' configs (' + errored + ' errored).');

// ---------------------------------------------------------------------------
console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
