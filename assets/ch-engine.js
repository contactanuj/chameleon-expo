/*
 * ch-engine.js — The Chameleon rules engine (pure, transport-agnostic).
 *
 * No DOM, no network. Deterministic given (config, topic, seed), so it can be:
 *   - unit-tested in Node by simulating full games (tests/engine.test.js),
 *   - inlined into the pass-and-play app.html (this APK),
 *   - reused verbatim by a future "Chameleon Online" build.
 *
 * State is a plain JSON-serializable object (survives localStorage / network sync).
 * Randomness uses a seeded PRNG stored on the state (state.rngState) so role/word
 * assignment is reproducible and a whole match can be replayed from (config, seed).
 *
 * This is a DIGITAL adaptation: the app is the only source of truth. The physical
 * game's dice + code cards + topic-card coordinates exist only because paper can't
 * privately tell each player one word — the app does that directly by passing the
 * device. So there are no dice/codes here: every non-Chameleon player simply sees
 * the secret word/picture; the Chameleon does not.
 *
 * Rules follow the official Chameleon rulebook (Big Potato / Crown & Andrews),
 * including the 3-player two-guess rule, the 7-8 player hide-the-grid variant,
 * and the optional first-to-5 scoring guide. Everything is configurable.
 */
(function (root, factory) {
  var CH = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = CH;
  if (root) root.CH = CH;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Phases (round flow). Which phases are visited depends on the config:
  //   reveal -> [clues] -> [debate] -> vote -> tally -> [guess] -> round_over
  // A match is a sequence of rounds; with scoring on it ends at game_over.
  // ---------------------------------------------------------------------------
  var PHASES = ['reveal', 'clues', 'debate', 'vote', 'tally', 'guess', 'round_over', 'game_over'];

  var VOTING_MODES = ['table', 'open', 'secret'];
  var TIE_BREAKERS = ['dealer', 'revote', 'chameleon_escapes'];
  var DEALER_ROTATIONS = ['chameleon', 'clockwise', 'random'];
  var EDITIONS = ['word', 'picture', 'mixed'];

  var OUTCOMES = {
    escaped_undetected: 'The Chameleon escaped undetected',
    caught_guessed: 'Caught — but guessed the secret word and escaped',
    caught_failed: 'Caught — and failed to guess the secret word'
  };

  // ---------------------------------------------------------------------------
  // Seeded PRNG (mulberry32) — deterministic + JSON-serializable via state.rngState.
  // ---------------------------------------------------------------------------
  function nextRand(state) {
    var t = (state.rngState = (state.rngState + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(state, n) { return Math.floor(nextRand(state) * n); }
  function shuffleInPlace(state, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(nextRand(state) * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ---------------------------------------------------------------------------
  // Config construction + validation.
  // ---------------------------------------------------------------------------
  function defaultNames(pc) {
    var out = [];
    for (var i = 0; i < pc; i++) out.push('Player ' + (i + 1));
    return out;
  }

  function makeBots(pc, val) { var a = []; for (var i = 0; i < pc; i++) a.push(!!val); return a; }
  function anyBots(config) {
    if (!config || !config.bots) return false;
    for (var i = 0; i < config.bots.length; i++) if (config.bots[i]) return true;
    return false;
  }
  function isBotSeat(config, i) { return !!(config && config.bots && config.bots[i]); }
  var BOT_DIFFICULTIES = ['easy', 'medium', 'hard'];

  // A faithful default config for a player count. 4-8 is the official sweet spot;
  // 3 is officially supported with the two-guess rule; outside that we still play.
  function defaultConfig(playerCount, names) {
    var pc = playerCount || 4;
    return {
      playerCount: pc,
      playerNames: (names && names.slice(0, pc)) || defaultNames(pc),

      // Content
      edition: 'word',            // which topic types to draw from: word | picture | mixed
      categories: null,           // null = all categories; or array of category ids to allow
      includeCustom: true,        // also draw from the player's saved custom topics

      // Roles
      chameleonCount: 1,          // official = 1; >1 is a harder house variant (team)

      // Bots (optional, purely additive — botless games behave exactly as before).
      // `bots[i] === true` makes seat i a computer player. botDifficulty: easy|medium|hard.
      bots: makeBots(pc, false),
      botDifficulty: 'medium',

      // Reveal
      revealSeconds: 6,           // the private secret/role reveal auto-hides after N seconds
                                  // (always on, so a card can't be left on screen for others)

      // Round flow
      cluePhase: true,            // app guides clue order (each says one word, clockwise from dealer)
      recordClues: false,         // optionally type each spoken clue so the debate can recap them
      debatePhase: true,          // an explicit "discuss now" step before voting
      hideGridDuringDebate: false,// 7-8 player variant: hide the grid once clues are given

      // Catching the Chameleon
      votingMode: 'table',        // table = point IRL & record the accused; open = tap each vote; secret = pass to vote
      revealVotes: true,          // show who each player voted for (open/secret modes)
      tieBreaker: 'dealer',       // dealer | revote | chameleon_escapes
      chameleonGuesses: 1,        // guesses if caught (rulebook = 1)
      threePlayerTwoGuesses: true,// auto-grant 2 guesses at exactly 3 players (rulebook)

      // Scoring (optional in the rulebook)
      scoring: true,
      winTarget: 5,               // first to N points wins the match
      scoreEscape: 2,             // Chameleon escapes undetected
      scoreCaughtGuessed: 1,      // Chameleon caught but guesses the word
      scoreCaughtFailed: 2,       // everyone else, when the Chameleon is caught and fails

      // Timers (seconds; 0 = off). Non-binding — they add party-game pressure but
      // never force a transition. The clue timer emulates the box's sand timer for
      // thinking of your word; the debate timer keeps the argument from dragging.
      clueTimer: 0,
      debateTimer: 120,

      // Misc
      dealerRotation: 'chameleon',// who deals next round: the caught Chameleon (rulebook) | clockwise | random
      showCoordinates: false      // show A1..D4 coordinate labels on the grid (cosmetic homage)
    };
  }

  // Returns { ok, errors:[], warnings:[] }.
  // errors block starting a game; warnings are off-spec but still playable.
  // `library` (optional) = the topic library so we can warn about empty selections.
  function validateConfig(config, library) {
    var errors = [], warnings = [];
    var c = config;
    if (!c || typeof c !== 'object') {
      return { ok: false, errors: ['No configuration provided.'], warnings: [] };
    }

    var pc = c.playerCount;
    if (!(pc >= 2)) errors.push('You need at least 2 players.');
    else if (pc < 3) warnings.push('The Chameleon is best with 3 or more players — 2 is barely a game.');

    // Names: one per player, non-empty, unique-ish.
    var names = c.playerNames || [];
    if (names.length !== pc) {
      errors.push('You have ' + names.length + ' name(s) but ' + pc + ' player(s).');
    }
    var seen = {};
    for (var i = 0; i < names.length; i++) {
      var nm = (names[i] || '').trim();
      if (!nm) { errors.push('Every player needs a name (player ' + (i + 1) + ' is blank).'); continue; }
      var key = nm.toLowerCase();
      if (seen[key]) warnings.push('Duplicate name "' + nm + '" — players may be hard to tell apart.');
      seen[key] = true;
    }

    // Chameleon count.
    var cc = c.chameleonCount;
    if (!(cc >= 1)) errors.push('There must be at least 1 Chameleon.');
    else if (pc >= 2 && cc >= pc) errors.push('The Chameleon(s) cannot be every player — leave at least one in the know.');
    else if (cc > 1) {
      warnings.push('More than one Chameleon is a house variant (they form a team). Balance is untested.');
      if (cc > Math.floor(pc / 2)) warnings.push('With ' + cc + ' Chameleons and only ' + pc + ' players, the informed players are outnumbered.');
    }

    // Edition.
    if (EDITIONS.indexOf(c.edition) === -1) errors.push('Edition must be one of: word, picture, mixed.');

    // Topic availability (if a library was provided).
    if (library) {
      var avail = availableTopics(c, library);
      if (avail.length === 0) {
        errors.push('No topics match your selection (edition / categories / custom). Enable more topics or change the edition.');
      } else if (avail.length < 3) {
        warnings.push('Only ' + avail.length + ' topic(s) match your selection — rounds will repeat quickly.');
      }
    }

    // Voting.
    if (VOTING_MODES.indexOf(c.votingMode) === -1) errors.push('Voting mode must be one of: table, open, secret.');
    if (TIE_BREAKERS.indexOf(c.tieBreaker) === -1) errors.push('Tie-breaker must be one of: dealer, revote, chameleon_escapes.');

    // Guesses.
    if (!(c.chameleonGuesses >= 1)) errors.push('The Chameleon needs at least 1 guess when caught.');

    // Scoring.
    if (c.scoring) {
      if (!(c.winTarget >= 1)) errors.push('The winning score must be at least 1 point.');
      if (!(c.scoreEscape >= 0) || !(c.scoreCaughtGuessed >= 0) || !(c.scoreCaughtFailed >= 0)) {
        errors.push('Point values cannot be negative.');
      }
      if (c.scoreEscape === 0 && c.scoreCaughtGuessed === 0 && c.scoreCaughtFailed === 0) {
        warnings.push('All point values are 0 — nobody can ever win the match.');
      }
    }

    if (DEALER_ROTATIONS.indexOf(c.dealerRotation) === -1) errors.push('Dealer rotation must be one of: chameleon, clockwise, random.');

    // Timers (optional; 0 = off). Tolerate missing fields from older saved configs.
    if (c.clueTimer != null && c.clueTimer < 0) errors.push('The clue timer cannot be negative.');
    if (c.debateTimer != null && c.debateTimer < 0) errors.push('The debate timer cannot be negative.');
    if (c.revealSeconds != null && !(c.revealSeconds >= 1)) errors.push('The reveal time must be at least 1 second.');

    // Bots (optional). Only constrain things when bots are actually present.
    if (c.botDifficulty != null && BOT_DIFFICULTIES.indexOf(c.botDifficulty) === -1) {
      errors.push('Bot difficulty must be one of: easy, medium, hard.');
    }
    if (anyBots(c)) {
      var botCount = 0, humanCount = 0;
      for (var bi = 0; bi < pc; bi++) { if (isBotSeat(c, bi)) botCount++; else humanCount++; }
      if (humanCount === 0) warnings.push('No human players — the app will just play itself. Add at least one human.');
      if (!c.cluePhase) warnings.push('Bots reason from the clues — with the clue phase off they have nothing to go on (they\'ll vote at random). Turn the clue phase on for bot games.');
      if (library) {
        var botTopics = availableTopics(c, library).filter(function (t) { return t.botClues && t.botClues.length; });
        if (botTopics.length === 0) {
          errors.push('Bots have no clue knowledge for any selected topic. Include a bot-supported category/topic, or turn bots off.');
        } else if (botTopics.length < 3) {
          warnings.push('Only ' + botTopics.length + ' bot-supported topic(s) match your selection — bot rounds will repeat. Bots only know the curated topics.');
        }
      }
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ---------------------------------------------------------------------------
  // Topic library helpers (the library itself lives in ch-content.js / custom).
  // A topic = { id, name, type:'word'|'picture', category, items:[ ... ] }.
  // ---------------------------------------------------------------------------
  function topicMatchesConfig(t, c) {
    if (c.edition !== 'mixed' && t.type !== c.edition) return false;
    if (t.custom && !c.includeCustom) return false;
    if (c.categories && c.categories.length && c.categories.indexOf(t.category) === -1) return false;
    return true;
  }

  function availableTopics(config, library) {
    var all = (library || []).slice();
    return all.filter(function (t) { return topicMatchesConfig(t, config); });
  }

  // Pick a topic for a new round, avoiding (where possible) recently-used ids.
  function pickTopic(state, library) {
    var avail = availableTopics(state.config, library);
    if (avail.length === 0) throw new Error('No topics available for this configuration.');
    // With bots in the game, only offer topics the bots actually have clue knowledge
    // for (so bots are competent). Fall back to all if none match.
    if (anyBots(state.config)) {
      var botReady = avail.filter(function (t) { return t.botClues && t.botClues.length; });
      if (botReady.length) avail = botReady;
    }
    var recent = state.recentTopicIds || [];
    var fresh = avail.filter(function (t) { return recent.indexOf(t.id) === -1; });
    var pool = fresh.length ? fresh : avail;
    return pool[randInt(state, pool.length)];
  }

  // ---------------------------------------------------------------------------
  // Game / match lifecycle.
  // ---------------------------------------------------------------------------
  function uid(i) { return 'p' + i; }

  // Create a fresh MATCH (round 1). `library` is the topic library to draw from.
  function newGame(config, library, seed) {
    var state = {
      config: deepClone(config),
      rngState: (seed >>> 0) || 1,
      players: [],
      scores: {},            // persists across rounds
      round: 0,
      dealerId: null,
      recentTopicIds: [],
      // per-round fields (populated by startRound)
      chameleonIds: [],
      topic: null,
      secretIndex: -1,
      clueOrder: [],
      clueIdx: 0,
      clues: {},
      votes: {},             // voterId -> suspectId
      lastVotes: null,
      accusedId: null,
      caught: false,
      guessesLeft: 0,
      guessHistory: [],      // indices the Chameleon has guessed this round
      chameleonGuessedCorrectly: false,
      outcome: null,
      roundScores: {},
      phase: 'reveal',
      winnerIds: null,
      log: []
    };

    var names = config.playerNames;
    for (var i = 0; i < names.length; i++) {
      var id = uid(i);
      state.players.push({ id: id, name: names[i], isBot: isBotSeat(config, i) });
      state.scores[id] = 0;
    }

    // First dealer is random.
    state.dealerId = state.players[randInt(state, state.players.length)].id;

    startRound(state, library, true);
    return state;
  }

  // Begin a new round (assign Chameleon(s), pick topic + secret cell, set order).
  // `firstRound` keeps the already-chosen random dealer; later rounds rotate.
  function startRound(state, library, firstRound) {
    state.round++;

    if (!firstRound) rotateDealer(state);

    // Assign Chameleon(s).
    var bag = state.players.map(function (p) { return p.id; });
    shuffleInPlace(state, bag);
    state.chameleonIds = bag.slice(0, Math.max(1, state.config.chameleonCount));

    // Pick topic + secret cell.
    var topic = pickTopic(state, library);
    state.topic = deepClone(topic);
    state.secretIndex = randInt(state, topic.items.length);
    state.recentTopicIds = (state.recentTopicIds || []).concat([topic.id]);
    // keep the "recently used" memory to about half the pool
    var avail = availableTopics(state.config, library);
    var keep = Math.max(0, Math.min(state.recentTopicIds.length, Math.floor(avail.length / 2)));
    state.recentTopicIds = state.recentTopicIds.slice(state.recentTopicIds.length - keep);

    // Clue order: clockwise starting from the dealer.
    state.clueOrder = orderFrom(state, state.dealerId);
    state.clueIdx = 0;
    state.clues = {};

    // Reset per-round state.
    state.votes = {};
    state.lastVotes = null;
    state.revoteCount = 0;
    state.accusedId = null;
    state.caught = false;
    state.guessesLeft = 0;
    state.guessHistory = [];
    state.chameleonGuessedCorrectly = false;
    state.outcome = null;
    state.roundScores = {};
    state.winnerIds = null;
    state.phase = 'reveal';

    pushLog(state, 'Round ' + state.round + ' — ' + nameOf(state, state.dealerId) + ' deals. Topic: ' +
      topic.name + ' (' + topic.type + ').');
    return state;
  }

  function rotateDealer(state) {
    var mode = state.config.dealerRotation;
    if (mode === 'chameleon' && state.chameleonIds && state.chameleonIds.length) {
      // Rulebook: the Chameleon for the round becomes the next dealer.
      state.dealerId = state.chameleonIds[0];
    } else if (mode === 'random') {
      state.dealerId = state.players[randInt(state, state.players.length)].id;
    } else {
      state.dealerId = clockwiseNext(state, state.dealerId);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers.
  // ---------------------------------------------------------------------------
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function getPlayer(state, id) {
    for (var i = 0; i < state.players.length; i++) if (state.players[i].id === id) return state.players[i];
    return null;
  }
  function nameOf(state, id) { var p = getPlayer(state, id); return p ? p.name : '?'; }
  function isChameleon(state, id) { return state.chameleonIds.indexOf(id) !== -1; }
  function pushLog(state, text) { state.log.push({ round: state.round, text: text }); }

  function indexOfPlayer(state, id) {
    for (var i = 0; i < state.players.length; i++) if (state.players[i].id === id) return i;
    return 0;
  }
  function clockwiseNext(state, fromId) {
    var idx = indexOfPlayer(state, fromId);
    return state.players[(idx + 1) % state.players.length].id;
  }
  // Player ids in seating order, starting at startId.
  function orderFrom(state, startId) {
    var idx = indexOfPlayer(state, startId);
    var out = [];
    for (var k = 0; k < state.players.length; k++) out.push(state.players[(idx + k) % state.players.length].id);
    return out;
  }

  // The word/emoji the informed players share this round.
  function secretItem(state) {
    return state.topic && state.secretIndex >= 0 ? state.topic.items[state.secretIndex] : null;
  }

  // What a given player should privately see during the reveal.
  function revealInfo(state, playerId) {
    var cham = isChameleon(state, playerId);
    var info = { isChameleon: cham, topic: { name: state.topic.name, type: state.topic.type } };
    if (cham) {
      info.secret = null;
      // With a team of Chameleons, each one knows the others.
      info.allies = state.chameleonIds.filter(function (id) { return id !== playerId; })
        .map(function (id) { return nameOf(state, id); });
    } else {
      info.secret = { index: state.secretIndex, item: secretItem(state) };
    }
    return info;
  }

  function effectiveGuesses(state) {
    var c = state.config;
    if (c.threePlayerTwoGuesses && state.players.length === 3) return Math.max(2, c.chameleonGuesses);
    return c.chameleonGuesses;
  }

  // ---------------------------------------------------------------------------
  // Phase transitions.
  // ---------------------------------------------------------------------------
  function beginClues(state) {
    // After the reveal, move into the first interactive phase per config.
    if (state.config.cluePhase) {
      state.phase = 'clues';
      pushLog(state, 'Clue phase begins with ' + nameOf(state, state.clueOrder[0]) + '.');
    } else if (state.config.debatePhase) {
      state.phase = 'debate';
    } else {
      state.phase = 'vote';
    }
    return state;
  }

  function currentClueGiver(state) {
    if (state.phase !== 'clues') return null;
    return state.clueOrder[state.clueIdx] || null;
  }

  // Advance the clue pointer; optionally record the spoken word.
  function nextClue(state, word) {
    if (state.phase !== 'clues') throw new Error('Not in the clue phase.');
    var giver = state.clueOrder[state.clueIdx];
    // Record whenever a word is supplied. Botless games without recordClues pass
    // null (so nothing is stored, exactly as before); bots and recorded clues store.
    if (word != null) {
      state.clues[giver] = ('' + word).slice(0, 40);
    }
    state.clueIdx++;
    if (state.clueIdx >= state.clueOrder.length) {
      state.phase = state.config.debatePhase ? 'debate' : 'vote';
      pushLog(state, 'All clues given.');
    }
    return state;
  }

  function beginVote(state) {
    state.phase = 'vote';
    state.votes = {};
    state.revoteCount = 0;
    return state;
  }

  // Cap on automatic re-votes before we force a deterministic decision, so a
  // perpetual tie (e.g. 2 players pointing at each other) can never hang a game.
  var MAX_REVOTES = 3;

  // ---------------------------------------------------------------------------
  // Voting for the suspect.
  // ---------------------------------------------------------------------------
  // open/secret modes: each player names a suspect; we tally the most-accused.
  function castVote(state, voterId, suspectId) {
    if (state.phase !== 'vote') throw new Error('Not in the voting phase.');
    if (!getPlayer(state, voterId)) throw new Error('Unknown voter.');
    if (!getPlayer(state, suspectId)) throw new Error('Unknown suspect.');
    if (voterId === suspectId) throw new Error('You cannot vote for yourself.');
    state.votes[voterId] = suspectId;
    return state;
  }

  function allVotesIn(state) {
    for (var i = 0; i < state.players.length; i++) {
      if (!state.votes[state.players[i].id]) return false;
    }
    return true;
  }

  // Tally open/secret votes -> determine the accused (handling ties per config).
  function resolveVotes(state) {
    if (state.phase !== 'vote') throw new Error('Not in the voting phase.');
    var tally = {};
    for (var v in state.votes) {
      if (!state.votes.hasOwnProperty(v)) continue;
      var s = state.votes[v];
      tally[s] = (tally[s] || 0) + 1;
    }
    var max = -1, leaders = [];
    for (var id in tally) {
      if (!tally.hasOwnProperty(id)) continue;
      if (tally[id] > max) { max = tally[id]; leaders = [id]; }
      else if (tally[id] === max) leaders.push(id);
    }
    state.lastVotes = { tally: tally, leaders: leaders.slice(), manual: false, ballots: deepClone(state.votes) };
    return finishVote(state, leaders);
  }

  // table mode (or any IRL tally): caller supplies the accused directly. Passing
  // an array of >1 ids means the table reported a tie.
  function resolveVotesManual(state, accusedOrLeaders) {
    if (state.phase !== 'vote') throw new Error('Not in the voting phase.');
    var leaders = Array.isArray(accusedOrLeaders) ? accusedOrLeaders.slice() : [accusedOrLeaders];
    state.lastVotes = { tally: null, leaders: leaders.slice(), manual: true, ballots: null };
    return finishVote(state, leaders);
  }

  // Resolve leaders -> a single accused (or a tie outcome) and move on.
  function finishVote(state, leaders) {
    if (leaders.length === 0) {
      // Degenerate (no votes at all) — treat as an unsuccessful accusation.
      return concludeRound(state, null, 'escaped_undetected', 'No accusation was made — the Chameleon escapes.');
    }

    var accusedId;
    if (leaders.length === 1) {
      accusedId = leaders[0];
    } else {
      // Tie. 'revote' loops a few times (then falls back to the dealer so the
      // game can never hang); 'chameleon_escapes' ends it; 'dealer' decides now.
      var tb = state.config.tieBreaker;
      if (tb === 'revote' && state.revoteCount < MAX_REVOTES) {
        state.revoteCount++;
        state.phase = 'vote';
        state.votes = {};
        state.lastVotes = { tally: null, leaders: leaders.slice(), manual: false, ballots: null, revote: true, revoteAmong: leaders.slice() };
        pushLog(state, 'Tied vote — revote (' + state.revoteCount + ') among ' +
          leaders.map(function (id) { return nameOf(state, id); }).join(', ') + '.');
        return state;
      }
      if (tb === 'chameleon_escapes') {
        return concludeRound(state, null, 'escaped_undetected', 'Tied vote — no one was accused, the Chameleon escapes.');
      }
      // 'dealer', or 'revote' exhausted: the dealer casts the deciding vote among
      // the tied players (using their own ballot if it points at one, else the first).
      var dealerVote = state.votes[state.dealerId];
      accusedId = (dealerVote && leaders.indexOf(dealerVote) !== -1) ? dealerVote : leaders[0];
      pushLog(state, 'Tied vote — the dealer (' + nameOf(state, state.dealerId) + ') decides: ' + nameOf(state, accusedId) + '.');
    }

    state.accusedId = accusedId;
    state.phase = 'tally';
    pushLog(state, 'The table accuses ' + nameOf(state, accusedId) + '.');
    return state;
  }

  // Reveal the accused. If they are the Chameleon -> the Chameleon gets to guess.
  // Otherwise the Chameleon escaped undetected.
  function revealAccused(state) {
    if (state.phase !== 'tally') throw new Error('No accusation to reveal.');
    var accusedId = state.accusedId;
    state.caught = isChameleon(state, accusedId);
    if (!state.caught) {
      return concludeRound(state, accusedId, 'escaped_undetected',
        nameOf(state, accusedId) + ' is NOT the Chameleon. The Chameleon escaped!');
    }
    // Caught — the Chameleon takes a guess at the secret word.
    state.guessesLeft = effectiveGuesses(state);
    state.guessHistory = [];
    state.phase = 'guess';
    pushLog(state, nameOf(state, accusedId) + ' IS the Chameleon! They get ' + state.guessesLeft +
      ' guess' + (state.guessesLeft === 1 ? '' : 'es') + ' at the secret word.');
    return state;
  }

  // The (caught) Chameleon guesses a grid cell by index.
  function chameleonGuess(state, index) {
    if (state.phase !== 'guess') throw new Error('Not in the guessing phase.');
    if (!(index >= 0 && index < state.topic.items.length)) throw new Error('Invalid guess index.');
    if (state.guessHistory.indexOf(index) !== -1) throw new Error('Already guessed that one.');
    state.guessHistory.push(index);
    state.guessesLeft--;
    if (index === state.secretIndex) {
      state.chameleonGuessedCorrectly = true;
      return concludeRound(state, state.accusedId, 'caught_guessed',
        'The Chameleon guessed "' + secretItem(state) + '" correctly and escapes at the last moment!');
    }
    if (state.guessesLeft <= 0) {
      return concludeRound(state, state.accusedId, 'caught_failed',
        'The Chameleon guessed wrong. The secret word was "' + secretItem(state) + '". Everyone else wins!');
    }
    pushLog(state, 'Wrong guess (' + state.topic.items[index] + '). ' + state.guessesLeft + ' guess(es) left.');
    return state;
  }

  // ---------------------------------------------------------------------------
  // Round conclusion + scoring.
  // ---------------------------------------------------------------------------
  function concludeRound(state, accusedId, outcome, message) {
    state.accusedId = accusedId;
    state.outcome = outcome;
    state.roundScores = {};
    state.players.forEach(function (p) { state.roundScores[p.id] = 0; });

    var c = state.config;
    if (c.scoring) {
      if (outcome === 'escaped_undetected') {
        state.chameleonIds.forEach(function (id) { state.roundScores[id] += c.scoreEscape; });
      } else if (outcome === 'caught_guessed') {
        state.chameleonIds.forEach(function (id) { state.roundScores[id] += c.scoreCaughtGuessed; });
      } else if (outcome === 'caught_failed') {
        state.players.forEach(function (p) {
          if (!isChameleon(state, p.id)) state.roundScores[p.id] += c.scoreCaughtFailed;
        });
      }
      // apply to running totals
      for (var id in state.roundScores) {
        if (state.roundScores.hasOwnProperty(id)) state.scores[id] += state.roundScores[id];
      }
    }

    pushLog(state, message);

    // Match win check.
    if (c.scoring) {
      var leaders = matchLeaders(state);
      if (leaders.atTarget.length > 0) {
        state.winnerIds = leaders.atTarget;
        state.phase = 'game_over';
        pushLog(state, 'Match over — ' + leaders.atTarget.map(function (id) { return nameOf(state, id); }).join(', ') +
          ' reached ' + c.winTarget + ' points.');
        return state;
      }
    }

    state.phase = 'round_over';
    return state;
  }

  // Players whose running score >= winTarget (and the current max).
  function matchLeaders(state) {
    var c = state.config;
    var max = -Infinity, atMax = [], atTarget = [];
    state.players.forEach(function (p) {
      var s = state.scores[p.id];
      if (s > max) { max = s; atMax = [p.id]; }
      else if (s === max) atMax.push(p.id);
    });
    if (c.scoring) {
      // winners must be at/over target AND tied for the lead
      atMax.forEach(function (id) { if (state.scores[id] >= c.winTarget) atTarget.push(id); });
    }
    return { max: max, atMax: atMax, atTarget: atTarget };
  }

  // Standings sorted high -> low.
  function standings(state) {
    return state.players.map(function (p) {
      return { id: p.id, name: p.name, score: state.scores[p.id] };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  // Start the next round of the same match (keeps scores + dealer rotation).
  function nextRound(state, library) {
    if (state.phase === 'game_over') throw new Error('The match is over.');
    startRound(state, library, false);
    return state;
  }

  // Fresh match, same players & config (scores reset).
  function rematch(state, library, seed) {
    return newGame(state.config, library, seed);
  }

  return {
    PHASES: PHASES,
    VOTING_MODES: VOTING_MODES,
    TIE_BREAKERS: TIE_BREAKERS,
    DEALER_ROTATIONS: DEALER_ROTATIONS,
    EDITIONS: EDITIONS,
    OUTCOMES: OUTCOMES,
    // config
    defaultConfig: defaultConfig,
    defaultNames: defaultNames,
    makeBots: makeBots,
    anyBots: anyBots,
    isBotSeat: isBotSeat,
    validateConfig: validateConfig,
    // topics
    topicMatchesConfig: topicMatchesConfig,
    availableTopics: availableTopics,
    // lifecycle
    newGame: newGame,
    startRound: startRound,
    nextRound: nextRound,
    rematch: rematch,
    // queries
    getPlayer: getPlayer,
    nameOf: nameOf,
    isChameleon: isChameleon,
    secretItem: secretItem,
    revealInfo: revealInfo,
    currentClueGiver: currentClueGiver,
    effectiveGuesses: effectiveGuesses,
    allVotesIn: allVotesIn,
    matchLeaders: matchLeaders,
    standings: standings,
    orderFrom: orderFrom,
    // phase actions
    beginClues: beginClues,
    nextClue: nextClue,
    beginVote: beginVote,
    castVote: castVote,
    resolveVotes: resolveVotes,
    resolveVotesManual: resolveVotesManual,
    revealAccused: revealAccused,
    chameleonGuess: chameleonGuess
  };
});
