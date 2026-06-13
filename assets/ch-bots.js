/*
 * ch-bots.js — offline curated bot decisions for The Chameleon (pure, testable).
 *
 * No DOM, no network, no LLM. Bots reason ONLY over the curated clue pools attached
 * to each topic (state.topic.botClues) + the clues recorded this round. Deterministic
 * given the state (seeded per game/round/bot), so bot games are unit-tested like the
 * engine. Bots are OPTIONAL and additive — botless play never calls this module.
 *
 * Design goals (per the brief): competent & believable (not duds), but FAIR to a
 * human Chameleon — bots judge clues they can evaluate (pool membership) confidently,
 * treat unfamiliar free-text clues as merely uncertain (not damning), and carry
 * difficulty-scaled randomness so a human bluffer can still escape.
 *
 * Three decisions: decideClue (give a clue / bluff), decideVote (accuse), decideGuess
 * (a caught Chameleon guesses the word).
 */
(function (root, factory) {
  var B = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  if (root) root.CHBOT = B;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // randomness per (game seed, round, bot) — independent of call order, so tests
  // are reproducible and a bot's choices don't shift when unrelated calls happen.
  function hashStr(s) {
    var h = 2166136261;
    s = '' + s;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function botRng(state, botId, salt) {
    return makeRng((state.rngState >>> 0) ^ hashStr(botId) ^ Math.imul(state.round || 1, 2654435761) ^ hashStr(salt || ''));
  }

  function norm(w) { return ('' + (w == null ? '' : w)).trim().toLowerCase(); }
  function inPool(pool, w) {
    if (!pool) return false;
    for (var i = 0; i < pool.length; i++) if (norm(pool[i]) === w) return true;
    return false;
  }
  function isCham(state, id) { return state.chameleonIds.indexOf(id) !== -1; }
  function recordedWord(state, id) { return state.clues ? state.clues[id] : null; }

  // clues said by everyone except `exceptId` (only those actually recorded)
  function otherClueWords(state, exceptId) {
    var out = [];
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      if (p.id === exceptId) continue;
      var w = recordedWord(state, p.id);
      if (w != null && ('' + w).trim() !== '') out.push(norm(w));
    }
    return out;
  }
  function saidSet(state) {
    var set = {};
    for (var id in state.clues) if (state.clues.hasOwnProperty(id)) set[norm(state.clues[id])] = true;
    return set;
  }

  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

  // cell whose pool best matches a list of given (normalized) words; rng breaks ties
  function inferCell(pools, given, rng) {
    var best = -1, bestScore = -1, ties = [];
    for (var c = 0; c < pools.length; c++) {
      var sc = 0;
      for (var i = 0; i < given.length; i++) if (inPool(pools[c], given[i])) sc++;
      if (sc > bestScore) { bestScore = sc; ties = [c]; }
      else if (sc === bestScore) ties.push(c);
    }
    if (bestScore <= 0) return Math.floor(rng() * pools.length); // no signal -> random
    best = ties[Math.floor(rng() * ties.length)];
    return best;
  }

  // words that appear across many cells = "safe" generic bluff words
  function genericWords(pools) {
    var freq = {};
    for (var c = 0; c < pools.length; c++) {
      var seen = {};
      for (var i = 0; i < pools[c].length; i++) {
        var w = norm(pools[c][i]);
        if (seen[w]) continue; seen[w] = true;
        freq[w] = (freq[w] || 0) + 1;
      }
    }
    var arr = [];
    for (var k in freq) if (freq.hasOwnProperty(k) && freq[k] >= 2) arr.push([k, freq[k]]);
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.map(function (x) { return x[0]; });
  }

  var GENERIC_FALLBACK = ['common', 'related', 'similar', 'tricky', 'usual', 'everyday'];

  // Suspicion that a clue belongs to someone who does NOT know `cell`:
  //   in cell's pool      -> 0.0  (clearly knows: innocent)
  //   in another cell pool -> 0.7  (talking about the wrong thing: suspicious)
  //   unknown / no data    -> 0.35 (could be a valid human word we don't have: uncertain)
  function suspicion(word, cell, pools) {
    var w = norm(word);
    if (!pools || w === '') return 0.35;
    if (inPool(pools[cell], w)) return 0.0;
    for (var c = 0; c < pools.length; c++) if (c !== cell && inPool(pools[c], w)) return 0.7;
    return 0.35;
  }

  var RANDOM_CHANCE = { easy: 0.5, medium: 0.2, hard: 0.05 };
  function diffOf(state) { var d = state.config.botDifficulty; return RANDOM_CHANCE.hasOwnProperty(d) ? d : 'medium'; }

  // ---------------------------------------------------------------------------
  function decideClue(state, botId) {
    var pools = state.topic.botClues;
    var rng = botRng(state, botId, 'clue');
    var said = saidSet(state);
    var diff = diffOf(state);

    function fresh(list) { var f = list.filter(function (w) { return !said[norm(w)]; }); return f.length ? f : list; }

    if (!isCham(state, botId)) {
      var pool = pools ? pools[state.secretIndex] : null;
      if (pool && pool.length) {
        // easy bots occasionally pick a slightly off (other-cell) word -> more catchable
        if (diff === 'easy' && rng() < 0.3 && pools.length > 1) {
          var oc; do { oc = Math.floor(rng() * pools.length); } while (oc === state.secretIndex);
          return pick(fresh(pools[oc]), rng);
        }
        return pick(fresh(pool), rng);
      }
      return pick(fresh(GENERIC_FALLBACK), rng);
    }

    // Chameleon: bluff. Infer the likely secret from clues so far, blend in with a
    // DIFFERENT word from that cell. Weaker bots bluff more loosely (catchable).
    var given = otherClueWords(state, botId);
    if (pools) {
      if (given.length && !(diff === 'easy' && rng() < 0.5)) {
        var cell = inferCell(pools, given, rng);
        var cand = fresh(pools[cell]).filter(function (w) { return given.indexOf(norm(w)) === -1; });
        if (cand.length) return pick(cand, rng);
      }
      var gen = fresh(genericWords(pools));
      if (gen.length) return pick(gen.slice(0, Math.max(3, Math.ceil(gen.length / 3))), rng);
    }
    return pick(fresh(GENERIC_FALLBACK), rng);
  }

  // ---------------------------------------------------------------------------
  function decideVote(state, botId) {
    var pools = state.topic.botClues;
    var rng = botRng(state, botId, 'vote');
    var diff = diffOf(state);
    var others = state.players.filter(function (p) { return p.id !== botId; });

    if (rng() < RANDOM_CHANCE[diff]) return pick(others, rng).id; // difficulty noise

    var judgeCell;
    if (!isCham(state, botId)) {
      judgeCell = state.secretIndex;            // a knower judges against the real secret
    } else {
      var given = otherClueWords(state, botId); // a Chameleon plays along vs its best guess
      judgeCell = (pools && given.length) ? inferCell(pools, given, rng) : -1;
    }
    if (judgeCell < 0) return pick(others, rng).id;

    var best = null, bestS = -1, ties = [];
    for (var i = 0; i < others.length; i++) {
      var s = suspicion(recordedWord(state, others[i].id), judgeCell, pools);
      if (s > bestS) { bestS = s; ties = [others[i]]; }
      else if (s === bestS) ties.push(others[i]);
    }
    best = ties[Math.floor(rng() * ties.length)];
    return best.id;
  }

  // ---------------------------------------------------------------------------
  // A caught Chameleon guesses a cell from the clues the knowers gave. Returns an
  // index not already in guessHistory. Difficulty scales accuracy.
  function decideGuess(state, botId) {
    var pools = state.topic.botClues;
    var rng = botRng(state, botId, 'guess' + state.guessHistory.length);
    var n = state.topic.items.length;
    var avail = [];
    for (var i = 0; i < n; i++) if (state.guessHistory.indexOf(i) === -1) avail.push(i);
    if (!avail.length) return 0;

    var diff = diffOf(state);
    if (!pools || (diff === 'easy' && rng() < 0.5)) return pick(avail, rng);

    var given = otherClueWords(state, botId);
    if (!given.length) return pick(avail, rng);

    var best = avail[0], bestScore = -1, ties = [];
    for (var a = 0; a < avail.length; a++) {
      var cell = avail[a], sc = 0;
      for (var g = 0; g < given.length; g++) if (inPool(pools[cell], given[g])) sc++;
      if (sc > bestScore) { bestScore = sc; ties = [cell]; }
      else if (sc === bestScore) ties.push(cell);
    }
    if (bestScore <= 0) return pick(avail, rng);
    best = ties[Math.floor(rng() * ties.length)];
    return best;
  }

  return {
    decideClue: decideClue,
    decideVote: decideVote,
    decideGuess: decideGuess,
    // exposed for tests
    _suspicion: suspicion,
    _inferCell: inferCell,
    _genericWords: genericWords
  };
});
