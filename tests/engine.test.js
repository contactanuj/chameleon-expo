/*
 * engine.test.js — exercises ch-engine.js + ch-content.js with no dependencies.
 *
 * Run: node tests/engine.test.js   (or: npm test)
 *
 * Covers:
 *   - content library integrity (every Topic Card is well-formed)
 *   - config defaults + validation across the whole option space
 *   - role/secret assignment + the private reveal information
 *   - topic selection respects the chosen edition
 *   - every scoring outcome (escape / caught+guess / caught+fail) and match end
 *   - tie-breakers, including the revote cap that guarantees no infinite loop
 *   - fuzz: hundreds of full matches across many configurations, asserting every
 *     round terminates, no action throws, and all invariants hold throughout.
 */
'use strict';

var CH = require('../assets/ch-engine.js');
var CONTENT = require('../assets/ch-content.js');
var LIB = CONTENT.TOPICS;

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  FAIL: ' + msg); } }
function section(name) { console.log('\n# ' + name); }
function throws(fn, msg) { var t = false; try { fn(); } catch (e) { t = true; } ok(t, msg); }

// Small deterministic PRNG for choosing test ACTIONS (engine has its own seeded RNG).
function makeRng(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function ri(rng, n) { return Math.floor(rng() * n); }
function names(n) { var a = []; for (var i = 0; i < n; i++) a.push('P' + (i + 1)); return a; }
function cfg(pc, over) {
  var c = CH.defaultConfig(pc, names(pc));
  if (over) for (var k in over) if (over.hasOwnProperty(k)) c[k] = over[k];
  return c;
}

// ---------------------------------------------------------------------------
section('content library integrity');

(function () {
  var ids = {};
  var typeOk = true, lenOk = true, itemsOk = true, catOk = true;
  LIB.forEach(function (t) {
    if (ids[t.id]) ok(false, 'duplicate topic id: ' + t.id);
    ids[t.id] = true;
    if (t.type !== 'word' && t.type !== 'picture') typeOk = false;
    if (!Array.isArray(t.items) || t.items.length !== 16) { lenOk = false; console.error('   ' + t.id + ' has ' + (t.items ? t.items.length : '?') + ' items'); }
    var seen = {};
    t.items.forEach(function (it) {
      if (typeof it !== 'string' || !it.length) itemsOk = false;
      if (seen[it]) { /* duplicates within a topic are allowed but unusual */ }
      seen[it] = true;
    });
    if (!CONTENT.CATEGORIES[t.category]) catOk = false;
  });
  ok(typeOk, 'every topic has a valid type');
  ok(lenOk, 'every built-in topic has exactly 16 items (fills a 4x4 grid)');
  ok(itemsOk, 'every item is a non-empty string');
  ok(catOk, 'every topic uses a known category');
  ok(LIB.filter(function (t) { return t.type === 'word'; }).length >= 8, 'has a decent set of word topics');
  ok(LIB.filter(function (t) { return t.type === 'picture'; }).length >= 4, 'has picture (emoji) topics');
})();

// ---------------------------------------------------------------------------
section('config defaults & validation');

[3, 4, 5, 6, 7, 8].forEach(function (pc) {
  var v = CH.validateConfig(cfg(pc), LIB);
  ok(v.ok, pc + 'p default config validates (errors: ' + JSON.stringify(v.errors) + ')');
});

ok(!CH.validateConfig(cfg(4, { chameleonCount: 0 }), LIB).ok, 'zero Chameleons is an error');
ok(!CH.validateConfig(cfg(4, { chameleonCount: 4 }), LIB).ok, 'everyone-a-Chameleon is an error');
ok(!CH.validateConfig(cfg(4, { edition: 'banana' }), LIB).ok, 'unknown edition is an error');
ok(!CH.validateConfig(cfg(4, { votingMode: 'telepathy' }), LIB).ok, 'unknown voting mode is an error');
ok(!CH.validateConfig(cfg(4, { tieBreaker: 'coinflip' }), LIB).ok, 'unknown tie-breaker is an error');
ok(!CH.validateConfig(cfg(4, { dealerRotation: 'spiral' }), LIB).ok, 'unknown dealer rotation is an error');
ok(!CH.validateConfig(cfg(4, { chameleonGuesses: 0 }), LIB).ok, 'zero guesses is an error');
(function () { var c = cfg(4); c.playerNames[1] = ''; ok(!CH.validateConfig(c, LIB).ok, 'blank name is an error'); })();
(function () { var c = cfg(4); c.playerNames = ['A', 'B', 'C']; ok(!CH.validateConfig(c, LIB).ok, 'name count mismatch is an error'); })();
(function () { var c = cfg(4, { scoring: true, winTarget: 0 }); ok(!CH.validateConfig(c, LIB).ok, 'win target < 1 is an error'); })();
(function () { var c = cfg(4, { scoring: true, scoreEscape: -1 }); ok(!CH.validateConfig(c, LIB).ok, 'negative points is an error'); })();

// No topics for an edition with no matching categories -> error.
(function () {
  var c = cfg(4, { edition: 'picture', categories: ['geography'], includeCustom: false }); // no picture topic in 'geography'
  var v = CH.validateConfig(c, LIB);
  ok(!v.ok, 'edition/category combo with no topics is an error');
})();

// Warnings (playable, not errors).
ok(CH.validateConfig(cfg(2), LIB).warnings.length > 0, '2 players warns (still playable)');
ok(CH.validateConfig(cfg(6, { chameleonCount: 2 }), LIB).warnings.length > 0, 'multi-Chameleon warns');

// ---------------------------------------------------------------------------
section('role & secret assignment, reveal info');

(function () {
  var s = CH.newGame(cfg(6), LIB, 12345);
  ok(s.chameleonIds.length === 1, '6p assigns exactly 1 Chameleon');
  ok(s.secretIndex >= 0 && s.secretIndex < s.topic.items.length, 'secret index is within the grid');
  var cham = s.chameleonIds[0];
  var other = s.players.filter(function (p) { return p.id !== cham; })[0].id;
  var ci = CH.revealInfo(s, cham), oi = CH.revealInfo(s, other);
  ok(ci.isChameleon && ci.secret === null, 'Chameleon sees no secret word');
  ok(!oi.isChameleon && oi.secret && oi.secret.item === s.topic.items[s.secretIndex], 'others see the correct secret word');

  // multi-Chameleon: each knows the other(s)
  var s2 = CH.newGame(cfg(6, { chameleonCount: 2 }), LIB, 999);
  ok(s2.chameleonIds.length === 2, 'chameleonCount:2 assigns 2 Chameleons');
  var info = CH.revealInfo(s2, s2.chameleonIds[0]);
  ok(info.allies.length === 1, 'a Chameleon knows their 1 ally');
})();

// ---------------------------------------------------------------------------
section('topic edition selection');

(function () {
  ['word', 'picture'].forEach(function (ed) {
    var s = CH.newGame(cfg(5, { edition: ed }), LIB, 7);
    var allRight = true;
    for (var r = 0; r < 12; r++) { if (s.topic.type !== ed) allRight = false; CH.nextRound(s, LIB); }
    ok(allRight, ed + ' edition only ever draws ' + ed + ' topics');
  });
  var avail = CH.availableTopics(cfg(5, { edition: 'mixed' }), LIB);
  ok(avail.length === LIB.length, 'mixed edition can draw from the whole library');
})();

// ---------------------------------------------------------------------------
section('scoring outcomes');

// Helper: take a fresh game to the vote with a known accused, then resolve.
function toAccusation(s, accusedId) {
  CH.beginClues(s);
  // fast-forward clues if present
  var guard = 0;
  while (s.phase === 'clues' && guard++ < 50) CH.nextClue(s, 'x');
  if (s.phase === 'debate') CH.beginVote(s);
  if (s.phase !== 'vote') throw new Error('expected vote phase, got ' + s.phase);
  CH.resolveVotesManual(s, accusedId);
}

// (1) Accuse a non-Chameleon -> escaped_undetected -> Chameleon +scoreEscape.
(function () {
  var s = CH.newGame(cfg(5, { cluePhase: false, debatePhase: false }), LIB, 3);
  var cham = s.chameleonIds[0];
  var notCham = s.players.filter(function (p) { return p.id !== cham; })[0].id;
  toAccusation(s, notCham);
  CH.revealAccused(s);
  ok(s.outcome === 'escaped_undetected', 'accusing the wrong player => escaped_undetected');
  ok(s.scores[cham] === s.config.scoreEscape, 'Chameleon scores escape points');
  s.players.forEach(function (p) { if (p.id !== cham) ok(s.scores[p.id] === 0, 'non-Chameleon scores 0 on escape'); });
})();

// (2) Catch the Chameleon, who then guesses the word -> caught_guessed -> Chameleon +1.
(function () {
  var s = CH.newGame(cfg(5, { cluePhase: false, debatePhase: false }), LIB, 4);
  var cham = s.chameleonIds[0];
  toAccusation(s, cham);
  CH.revealAccused(s);
  ok(s.phase === 'guess', 'catching the Chameleon opens the guess phase');
  CH.chameleonGuess(s, s.secretIndex); // correct
  ok(s.outcome === 'caught_guessed', 'correct guess => caught_guessed');
  ok(s.scores[cham] === s.config.scoreCaughtGuessed, 'Chameleon scores the caught-but-guessed points');
})();

// (3) Catch the Chameleon, who guesses wrong until out -> caught_failed -> others +2.
(function () {
  var s = CH.newGame(cfg(5, { cluePhase: false, debatePhase: false, chameleonGuesses: 1 }), LIB, 5);
  var cham = s.chameleonIds[0];
  toAccusation(s, cham);
  CH.revealAccused(s);
  var wrong = (s.secretIndex + 1) % s.topic.items.length;
  CH.chameleonGuess(s, wrong);
  ok(s.outcome === 'caught_failed', 'wrong guess with no guesses left => caught_failed');
  ok(s.scores[cham] === 0, 'caught Chameleon scores 0 when wrong');
  s.players.forEach(function (p) { if (p.id !== cham) ok(s.scores[p.id] === s.config.scoreCaughtFailed, 'others score on a failed Chameleon'); });
})();

// 3-player rule: two guesses.
(function () {
  var s = CH.newGame(cfg(3, { cluePhase: false, debatePhase: false }), LIB, 6);
  ok(CH.effectiveGuesses(s) === 2, '3 players => 2 guesses');
  var cham = s.chameleonIds[0];
  toAccusation(s, cham);
  CH.revealAccused(s);
  ok(s.guessesLeft === 2, 'caught Chameleon gets 2 guesses at 3 players');
  var wrong = (s.secretIndex + 1) % s.topic.items.length;
  CH.chameleonGuess(s, wrong);
  ok(s.phase === 'guess' && s.guessesLeft === 1, 'first wrong guess leaves 1 and stays in guess');
  CH.chameleonGuess(s, s.secretIndex);
  ok(s.outcome === 'caught_guessed', 'second-chance correct guess => caught_guessed');
})();

// ---------------------------------------------------------------------------
section('tie-breakers (no infinite loops)');

// dealer decides
(function () {
  var s = CH.newGame(cfg(4, { cluePhase: false, debatePhase: false, tieBreaker: 'dealer' }), LIB, 8);
  CH.beginClues(s); if (s.phase === 'debate') CH.beginVote(s);
  var two = s.players.slice(0, 2).map(function (p) { return p.id; });
  CH.resolveVotesManual(s, two);
  ok(s.phase === 'tally' && two.indexOf(s.accusedId) !== -1, 'dealer tie-break picks one of the tied players');
})();

// chameleon escapes on tie
(function () {
  var s = CH.newGame(cfg(4, { cluePhase: false, debatePhase: false, tieBreaker: 'chameleon_escapes' }), LIB, 9);
  CH.beginClues(s); if (s.phase === 'debate') CH.beginVote(s);
  CH.resolveVotesManual(s, s.players.slice(0, 2).map(function (p) { return p.id; }));
  ok(s.outcome === 'escaped_undetected', 'chameleon_escapes tie-break ends the round as an escape');
})();

// revote cap: 2 players, open vote, perpetual tie must still terminate.
(function () {
  var s = CH.newGame(cfg(2, { cluePhase: false, debatePhase: false, tieBreaker: 'revote' }), LIB, 10);
  CH.beginClues(s); if (s.phase === 'debate') CH.beginVote(s);
  var guard = 0, terminated = false;
  while (guard++ < 20) {
    // each of the 2 players can only vote for the other => guaranteed tie
    s.players.forEach(function (p) {
      var other = s.players.filter(function (q) { return q.id !== p.id; })[0];
      CH.castVote(s, p.id, other.id);
    });
    CH.resolveVotes(s);
    if (s.phase !== 'vote') { terminated = true; break; }
  }
  ok(terminated, 'perpetual tie with revote terminates via the cap (no infinite loop)');
})();

// ---------------------------------------------------------------------------
section('dealer rotation & match end');

(function () {
  var s = CH.newGame(cfg(5, { dealerRotation: 'chameleon', cluePhase: false, debatePhase: false }), LIB, 11);
  var prevCham = s.chameleonIds[0];
  CH.nextRound(s, LIB);
  ok(s.dealerId === prevCham, "dealerRotation:'chameleon' makes the prior Chameleon the next dealer");

  var s2 = CH.newGame(cfg(5, { dealerRotation: 'clockwise' }), LIB, 12);
  var first = s2.dealerId, idx = s2.players.map(function (p) { return p.id; }).indexOf(first);
  CH.nextRound(s2, LIB);
  ok(s2.dealerId === s2.players[(idx + 1) % s2.players.length].id, "dealerRotation:'clockwise' advances one seat");
})();

// Match ends exactly when someone reaches the win target.
(function () {
  var s = CH.newGame(cfg(4, { cluePhase: false, debatePhase: false, scoring: true, winTarget: 4, scoreEscape: 2 }), LIB, 13);
  // Force two escapes for the same Chameleon line by always accusing a non-Chameleon.
  var rounds = 0;
  while (s.phase !== 'game_over' && rounds++ < 20) {
    var cham = s.chameleonIds[0];
    var notCham = s.players.filter(function (p) { return p.id !== cham; })[0].id;
    toAccusation(s, notCham);
    CH.revealAccused(s);
    if (s.phase === 'round_over') CH.nextRound(s, LIB);
  }
  ok(s.phase === 'game_over', 'match reaches game_over');
  ok(s.winnerIds && s.winnerIds.length >= 1, 'a winner is declared');
  s.winnerIds.forEach(function (id) { ok(s.scores[id] >= s.config.winTarget, 'each winner is at/over the target'); });
})();

// Scoring OFF: no automatic game_over; rounds keep coming.
(function () {
  var s = CH.newGame(cfg(4, { cluePhase: false, debatePhase: false, scoring: false }), LIB, 14);
  for (var r = 0; r < 6; r++) {
    var cham = s.chameleonIds[0];
    toAccusation(s, s.players.filter(function (p) { return p.id !== cham; })[0].id);
    CH.revealAccused(s);
    ok(s.phase === 'round_over', 'scoring off => round_over (never game_over)');
    CH.nextRound(s, LIB);
  }
})();

// self-vote is illegal
(function () {
  var s = CH.newGame(cfg(4), LIB, 15);
  CH.beginClues(s); var g = 0; while (s.phase === 'clues' && g++ < 50) CH.nextClue(s, 'x'); if (s.phase === 'debate') CH.beginVote(s);
  throws(function () { CH.castVote(s, s.players[0].id, s.players[0].id); }, 'a player cannot vote for themselves');
})();

// ---------------------------------------------------------------------------
section('fuzz: full matches across configurations');

function randRemainingGuess(s, rng) {
  var avail = [];
  for (var i = 0; i < s.topic.items.length; i++) if (s.guessHistory.indexOf(i) === -1) avail.push(i);
  return avail[ri(rng, avail.length)];
}

function doVote(s, rng) {
  if (s.config.votingMode === 'table') {
    var ids = s.players.map(function (p) { return p.id; });
    // 15% of the time report a 2-way tie to exercise tie handling
    if (rng() < 0.15 && ids.length >= 2) {
      var a = ids[ri(rng, ids.length)], b;
      do { b = ids[ri(rng, ids.length)]; } while (b === a);
      CH.resolveVotesManual(s, [a, b]);
    } else {
      CH.resolveVotesManual(s, ids[ri(rng, ids.length)]);
    }
  } else {
    s.players.forEach(function (p) {
      var others = s.players.filter(function (q) { return q.id !== p.id; });
      CH.castVote(s, p.id, others[ri(rng, others.length)].id);
    });
    CH.resolveVotes(s);
  }
}

function checkInvariants(s, label) {
  ok(s.chameleonIds.length === s.config.chameleonCount, label + ': chameleon count preserved');
  var uniq = {}; s.chameleonIds.forEach(function (id) { uniq[id] = true; });
  ok(Object.keys(uniq).length === s.chameleonIds.length, label + ': chameleons are distinct');
  ok(s.secretIndex >= 0 && s.secretIndex < s.topic.items.length, label + ': secret index valid');
  var allNonNeg = true; s.players.forEach(function (p) { if (s.scores[p.id] < 0) allNonNeg = false; });
  ok(allNonNeg, label + ': no negative scores');
}

function playMatch(c, seed) {
  var rng = makeRng(seed * 2654435761);
  var s = CH.newGame(c, LIB, seed);
  var matchGuard = 0;
  var checkedRounds = 0;
  while (s.phase !== 'game_over' && matchGuard++ < 400) {
    if (checkedRounds < 3) { checkInvariants(s, c.label + ' s' + seed); checkedRounds++; }
    // drive one round
    CH.beginClues(s);
    var roundGuard = 0;
    while (s.phase !== 'round_over' && s.phase !== 'game_over' && roundGuard++ < 300) {
      switch (s.phase) {
        case 'clues': CH.nextClue(s, 'clue'); break;
        case 'debate': CH.beginVote(s); break;
        case 'vote': doVote(s, rng); break;
        case 'tally': CH.revealAccused(s); break;
        case 'guess': CH.chameleonGuess(s, randRemainingGuess(s, rng)); break;
        default: throw new Error('unexpected phase: ' + s.phase);
      }
    }
    ok(roundGuard < 300, c.label + ' s' + seed + ': round terminated');
    ok(['round_over', 'game_over'].indexOf(s.phase) !== -1, c.label + ' s' + seed + ': round resolved to a known end');
    ok(!!s.outcome, c.label + ' s' + seed + ': an outcome was recorded');
    if (s.phase === 'round_over') {
      if (!c.scoring && s.round >= 8) break; // unscored matches are endless by design
      CH.nextRound(s, LIB);
    }
  }
  if (c.scoring) {
    ok(s.phase === 'game_over', c.label + ' s' + seed + ': scored match ended');
    ok(s.winnerIds && s.winnerIds.length >= 1, c.label + ' s' + seed + ': winner declared');
  }
  return s;
}

var editions = ['word', 'picture', 'mixed'];
var modes = ['table', 'open', 'secret'];
var ties = ['dealer', 'revote', 'chameleon_escapes'];
var combos = [];
for (var pc = 3; pc <= 8; pc++) {
  combos.push({ label: 'std' + pc, c: cfg(pc) });
}
editions.forEach(function (ed) {
  modes.forEach(function (mode) {
    ties.forEach(function (tb) {
      combos.push({ label: ed + '/' + mode + '/' + tb, c: cfg(5, { edition: ed, votingMode: mode, tieBreaker: tb }) });
    });
  });
});
combos.push({ label: '2cham', c: cfg(7, { chameleonCount: 2 }) });
combos.push({ label: 'noClue', c: cfg(5, { cluePhase: false, debatePhase: false }) });
combos.push({ label: 'recap', c: cfg(5, { recordClues: true }) });
combos.push({ label: 'noScore', c: cfg(5, { scoring: false }) });
combos.push({ label: 'hideGrid', c: cfg(8, { hideGridDuringDebate: true }) });

var matches = 0, errored = 0;
combos.forEach(function (combo) {
  combo.c.label = combo.label;
  for (var g = 0; g < 12; g++) {
    matches++;
    try { playMatch(combo.c, (matches * 7919 + g + 1)); }
    catch (e) { errored++; ok(false, combo.label + ' threw: ' + e.message); }
  }
});
console.log('  played ' + matches + ' full matches across ' + combos.length + ' configurations (' + errored + ' errored).');

// ---------------------------------------------------------------------------
console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
