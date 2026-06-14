/*
 * ui.js - pass-and-play UI for The Chameleon. Browser-only (uses the DOM).
 * Depends on the CH engine (window.CH) and the topic library (window.CH_CONTENT),
 * both inlined before this script by build.js.
 *
 * One device is passed around the table. The secret word/picture is shown only
 * behind a "pass the device to X" gate, so each informed player sees it privately
 * while the Chameleon never does. Everything else (the topic grid, clues, debate,
 * the vote, the reveal) is public on the shared screen.
 */
(function () {
  'use strict';
  var CH = window.CH;
  var CONTENT = window.CH_CONTENT;
  var CHBOT = window.CHBOT;
  var app = document.getElementById('app');

  var KEY = 'ch_state_v1';
  var CUSTOM_KEY = 'ch_custom_v1';
  var CONFIG_KEY = 'ch_config_v1';

  var G = null;        // engine match state (or null)
  var draft = null;    // setup config being edited
  var view = 'home';   // home | setup | rules | game | log | custom | customEdit
  var ui = {};         // transient per-screen UI state
  var timerHandle = null; // live countdown interval (debate/clue timers)
  var revealTimer = null;  // countdown that auto-hides a private secret/role reveal
  var lastRenderKey = null; // view(+phase) of the last render - for scroll preservation

  // ---- persistence -------------------------------------------------------
  function save() { try { if (G) localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} }
  function loadSaved() { try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function clearSaved() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function loadCustom() { try { var s = localStorage.getItem(CUSTOM_KEY); return s ? JSON.parse(s) : []; } catch (e) { return []; } }
  function saveCustom(list) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) {} }

  function saveConfig() { try { if (draft) localStorage.setItem(CONFIG_KEY, JSON.stringify(draft)); } catch (e) {} }
  function loadConfig() { try { var s = localStorage.getItem(CONFIG_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  // The full topic library = built-ins + the player's saved custom topics.
  function library() {
    var custom = loadCustom().map(function (t) { var c = JSON.parse(JSON.stringify(t)); c.custom = true; return c; });
    return CONTENT.TOPICS.concat(custom);
  }

  // ---- small helpers -----------------------------------------------------
  function esc(s) {
    return ('' + (s == null ? '' : s)).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function seed() { return ((Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0; }
  function nameOf(id) { return G ? CH.nameOf(G, id) : '?'; }
  function catLabel(id) { return CONTENT.CATEGORIES[id] || (id.charAt(0).toUpperCase() + id.slice(1)); }

  // ---- bots --------------------------------------------------------------
  // OpenMoji illustration for a picture cell (falls back to the emoji glyph).
  function artHtml(item) {
    var A = (typeof window !== 'undefined') ? window.CH_ART : null;
    return (A && A[item]) ? A[item] : esc(item);
  }

  function isBotId(id) { var p = G && CH.getPlayer(G, id); return !!(p && p.isBot); }
  function dn(id) { return (isBotId(id) ? '🤖 ' : '') + esc(nameOf(id)); } // display name (already escaped)
  function gAnyBots() { return !!(G && CH.anyBots(G.config)); }
  function dAnyBots() { return !!(draft && CH.anyBots(draft)); }
  var BOT_NAMES = ['Byte', 'Pixel', 'Echo', 'Nova', 'Chip', 'Glitch', 'Cosmo', 'Zappy', 'Robo', 'Widget', 'Circuit', 'Bolt'];

  // Categories present in the library for a given edition (word/picture/mixed).
  function categoriesForEdition(edition) {
    var set = {};
    library().forEach(function (t) {
      if (edition === 'mixed' || t.type === edition) set[t.category] = true;
    });
    return Object.keys(set);
  }

  function setUiPhase() {
    if (ui.phase !== G.phase) {
      ui.phase = G.phase;
      ui.gate = true;
      ui.revealIdx = null;
      ui.voteIdx = 0;
      ui.voterGate = true;
      ui.tablePick = {};
      ui.clueWord = '';
      ui.pendingBotClue = null;
      ui.pendingBotClueFor = null;
      ui.revealShown = false;
      ui.revealExpired = false;
    }
  }

  // ===========================================================================
  // RENDER DISPATCH
  // ===========================================================================
  function render() {
    clearTimer();
    clearRevealTimer();
    if (view === 'game' && G) setUiPhase();
    // Scroll to the top only when the SCREEN changes (new view, or new game phase).
    // In-place updates on the same screen (steppers, toggles, chips, selections)
    // preserve the scroll position so the UI never jumps back to the top.
    var key = view + (view === 'game' && G ? ':' + G.phase : '');
    var sameScreen = (key === lastRenderKey);
    var keepY = sameScreen ? (window.scrollY || window.pageYOffset || 0) : 0;
    var html;
    if (view === 'home') html = renderHome();
    else if (view === 'setup') html = renderSetup();
    else if (view === 'rules') html = renderRules();
    else if (view === 'log') html = renderLog();
    else if (view === 'custom') html = renderCustomList();
    else if (view === 'customEdit') html = renderCustomEdit();
    else if (view === 'recheck') html = renderRecheck();
    else if (view === 'game') html = renderGame();
    else html = renderHome();
    app.innerHTML = html;
    try {
      if (sameScreen) window.scrollTo(0, keepY);
      else { app.scrollTop = 0; window.scrollTo(0, 0); }
    } catch (e) {}
    lastRenderKey = key;
    maybeStartTimer();
    maybeStartRevealTimer();
  }

  // ---- countdown timers (non-binding; just visual pressure) ---------------
  function clearTimer() { if (timerHandle) { try { clearInterval(timerHandle); } catch (e) {} timerHandle = null; } }
  function fmtTime(s) { var m = Math.floor(s / 60), ss = s % 60; return m > 0 ? (m + ':' + (ss < 10 ? '0' : '') + ss) : (s + 's'); }
  function timerHtml(label, seconds) {
    return '<div id="timerWrap" class="timer"><span class="tlabel">' + esc(label) +
      '</span><span id="timerVal" class="tval">' + fmtTime(seconds) +
      '</span><button class="iconbtn" data-action="restartTimer" title="Restart">↻</button></div>';
  }
  function maybeStartTimer() {
    if (view !== 'game' || !G) return;
    var total = 0;
    if (G.phase === 'debate' && G.config.debateTimer > 0) total = G.config.debateTimer;
    else if (G.phase === 'clues' && G.config.clueTimer > 0) total = G.config.clueTimer;
    if (!total || typeof setInterval === 'undefined') return;
    var el = document.getElementById('timerVal');
    if (!el) return; // headless / no DOM
    var remaining = total;
    el.textContent = fmtTime(remaining);
    timerHandle = setInterval(function () {
      remaining--;
      var e = document.getElementById('timerVal');
      if (!e) { clearTimer(); return; }
      if (remaining <= 0) {
        e.textContent = "Time's up!";
        var w = document.getElementById('timerWrap'); if (w) w.className = 'timer up';
        clearTimer();
        return;
      }
      e.textContent = fmtTime(remaining);
    }, 1000);
  }

  // ---- private reveal auto-hide (roles are always timer-based) -------------
  function clearRevealTimer() { if (revealTimer) { try { clearInterval(revealTimer); } catch (e) {} revealTimer = null; } }
  function revealSecs() { return (G && G.config && G.config.revealSeconds > 0) ? G.config.revealSeconds : 6; }
  function countdownHtml() { return '<div class="note small center">Hiding in <b id="revealCount">' + revealSecs() + 's</b> - only you should see this</div>'; }
  function startRevealCountdown(onElapse) {
    if (typeof setInterval === 'undefined') return;
    var el = document.getElementById('revealCount');
    if (!el) return; // headless / no DOM - manual "hide & pass" still works
    var secs = revealSecs();
    el.textContent = secs + 's';
    revealTimer = setInterval(function () {
      secs--;
      var e = document.getElementById('revealCount');
      if (!e) { clearRevealTimer(); return; }
      if (secs <= 0) { clearRevealTimer(); onElapse(); return; }
      e.textContent = secs + 's';
    }, 1000);
  }
  // Auto-hide whichever private reveal is currently on screen (initial reveal or recheck).
  function maybeStartRevealTimer() {
    if (view === 'game' && G && G.phase === 'reveal' && ui.revealShown) {
      startRevealCountdown(function () { ui.revealShown = false; ui.revealExpired = true; render(); });
    } else if (view === 'recheck' && ui.recheck && ui.recheck.stage === 'show') {
      startRevealCountdown(function () { ui.recheck.stage = 'expired'; render(); });
    }
  }

  // ===========================================================================
  // HOME
  // ===========================================================================
  function renderHome() {
    var saved = loadSaved();
    var resume = (saved && saved.phase !== 'game_over')
      ? '<button class="btn primary" data-action="resume">Resume match (round ' + esc(saved.round) + ')</button>'
      : '';
    var quick = loadConfig()
      ? '<button class="btn" data-action="quickplay">Quick play (last settings)</button>'
      : '';
    return [
      '<div class="center" style="padding-top:26px">',
      '<div style="font-size:54px;line-height:1">🦎</div>',
      '<h1>THE CHAMELEON</h1>',
      '<p class="muted">Pass-and-play · one device · 3-8 players (2-12 supported)</p>',
      '</div>',
      '<div class="spacer"></div>',
      resume,
      '<button class="btn primary" data-action="newgame">New game</button>',
      quick,
      '<button class="btn" data-action="customTopics">Custom topics</button>',
      '<button class="btn" data-action="rules">How to play</button>',
      '<div class="spacer"></div>',
      '<p class="small muted center">A social bluffing game. Everyone gets the secret word - except the Chameleon, who must blend in. Word edition and Picture edition are both built in.</p>',
      '<p class="tiny muted center">The Chameleon is a trademark of its publishers (Big Potato / Crown &amp; Andrews). This is an unofficial fan-made companion app.</p>'
    ].join('');
  }

  // ===========================================================================
  // SETUP + CONFIGURATION (with live validation)
  // ===========================================================================
  function newDraft(pc) {
    // Start from fresh defaults so any newly-added config fields are always present,
    // then layer the last-used config on top (robust to older saved shapes).
    var base = CH.defaultConfig(pc || 4);
    var saved = loadConfig();
    if (saved && saved.playerCount) {
      for (var k in saved) if (saved.hasOwnProperty(k)) base[k] = saved[k];
      if (pc) base.playerCount = pc;
      if (!base.playerNames) base.playerNames = CH.defaultNames(base.playerCount);
    } else {
      base.categories = categoriesForEdition(base.edition);
    }
    return normalizeDraft(base);
  }

  function ensureCategories(d) {
    var avail = categoriesForEdition(d.edition);
    if (!d.categories) { d.categories = avail.slice(); return; }
    d.categories = d.categories.filter(function (c) { return avail.indexOf(c) !== -1; });
    if (d.categories.length === 0) d.categories = avail.slice();
  }

  function resizeNames(d) {
    while (d.playerNames.length < d.playerCount) d.playerNames.push('Player ' + (d.playerNames.length + 1));
    d.playerNames.length = d.playerCount;
    if (!d.bots) d.bots = [];
    while (d.bots.length < d.playerCount) d.bots.push(false);
    d.bots.length = d.playerCount;
  }

  // Keep the whole draft internally consistent with the player count, so an
  // invalid configuration can never be created or persisted (the controls
  // enforce the limits; nothing relies on the validation error alone).
  function normalizeDraft(d) {
    d.playerCount = Math.max(2, Math.min(12, d.playerCount | 0 || 4));
    resizeNames(d); // names + bots tracked to the player count
    var maxCham = Math.max(1, d.playerCount - 1);
    d.chameleonCount = Math.max(1, Math.min(maxCham, d.chameleonCount | 0 || 1)); // 1 .. players-1
    if (!(d.chameleonGuesses >= 1)) d.chameleonGuesses = 1;
    ensureCategories(d);
    return d;
  }

  function renderSetup() {
    if (!draft) draft = newDraft(4);
    normalizeDraft(draft);
    var v = CH.validateConfig(draft, library());
    var adv = !!ui.advanced;

    return [
      topbar('New game', '<button class="iconbtn" data-action="home">Cancel</button>'),

      '<div class="panel">',
      '<h3>Players</h3>',
      stepperRow('Number of players', 'playerCount', draft.playerCount, 2, 12),
      '<label>Seating order (clues go clockwise). Tap to switch Human / Bot.</label>',
      renderPlayerRows(draft),
      (dAnyBots()
        ? botDifficultyBlock(draft)
        : '<p class="small muted" style="margin-top:8px">Tip: switch a seat to 🤖 Bot to fill empty seats or practice solo. Bots give clues, vote and guess (they can\'t debate) and only play the built-in curated topics.</p>'),
      '</div>',

      '<div class="panel">',
      '<h3>Edition &amp; topics</h3>',
      '<label>Edition</label>',
      '<select data-cfg-select="edition">',
      editionOption('word', 'Word edition - classic 16-word topics', draft.edition),
      editionOption('picture', 'Picture edition - 16 emoji per grid', draft.edition),
      editionOption('mixed', 'Mixed - draw from both', draft.edition),
      '</select>',
      '<label>Categories to draw from</label>',
      renderCategoryChips(draft),
      checkboxRow('Include my custom topics', 'includeCustom', draft.includeCustom),
      '<button class="btn ghost sm" data-action="customTopics" style="width:auto;margin-top:8px">Manage custom topics →</button>',
      '</div>',

      '<div class="panel">',
      '<div class="collapse-h" data-action="toggleAdvanced">',
      '<h3 style="margin:0">Advanced configuration</h3>',
      '<span class="iconbtn">' + (adv ? 'Hide ▲' : 'Show ▼') + '</span>',
      '</div>',
      adv ? renderAdvanced(draft) : '',
      '</div>',

      renderValidation(v),

      (v.ok
        ? '<button class="btn primary" data-action="startGame">Start game</button>'
        : '<button class="btn primary" disabled>Resolve the issue' + (v.errors.length > 1 ? 's' : '') + ' above to start</button>'),
      '<button class="btn ghost" data-action="resetDefaults">Reset to defaults</button>'
    ].join('');
  }

  function renderPlayerRows(d) {
    return d.playerNames.map(function (n, i) {
      var bot = !!(d.bots && d.bots[i]);
      return '<div class="row" style="margin-top:6px">' +
        '<input class="grow" type="text" data-name-idx="' + i + '" value="' + esc(n) + '" placeholder="Player ' + (i + 1) + '" maxlength="16" />' +
        '<button class="iconbtn" data-bot="' + i + '" style="min-width:98px">' + (bot ? '🤖 Bot' : '👤 Human') + '</button>' +
        '</div>';
    }).join('');
  }

  function botDifficultyBlock(d) {
    return [
      '<label>Bot difficulty</label>',
      '<select data-cfg-select="botDifficulty">',
      vOpt('easy', 'Easy - loose clues, easy to read', d.botDifficulty),
      vOpt('medium', 'Medium - a solid, fair game', d.botDifficulty),
      vOpt('hard', 'Hard - sharp clue-readers', d.botDifficulty),
      '</select>',
      '<p class="small muted">Bots give clues, vote, and guess if caught - they can\'t debate, so the table talk is still yours. Bots only play the built-in curated topics.</p>'
    ].join('');
  }

  function renderCategoryChips(d) {
    var avail = categoriesForEdition(d.edition);
    if (avail.length === 0) return '<p class="small warn">No topics exist for this edition yet.</p>';
    return avail.map(function (c) {
      var on = !d.categories || d.categories.indexOf(c) !== -1;
      return '<span class="chip' + (on ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(catLabel(c)) + '</span>';
    }).join('');
  }

  function renderAdvanced(d) {
    var threeP = d.playerCount === 3;
    return [
      '<div class="spacer"></div>',
      '<h3>Chameleons</h3>',
      stepperRow('Number of Chameleons', 'chameleonCount', d.chameleonCount, 1, Math.max(1, d.playerCount - 1)),

      '<div class="spacer"></div>',
      '<h3>Round flow</h3>',
      stepperRow('Seconds to view your secret (auto-hides)', 'revealSeconds', d.revealSeconds || 6, 2, 30),
      checkboxRow('Guide the clue phase (one word each, clockwise)', 'cluePhase', d.cluePhase),
      checkboxRow('Type each clue so the app can recap them', 'recordClues', d.recordClues),
      checkboxRow('Separate “discuss now” step before voting', 'debatePhase', d.debatePhase),
      checkboxRow('Hide the grid during debate (7-8 player variant)', 'hideGridDuringDebate', d.hideGridDuringDebate),

      '<div class="spacer"></div>',
      '<h3>Catching the Chameleon</h3>',
      '<label>How the table votes</label>',
      '<select data-cfg-select="votingMode">',
      vOpt('table', 'Table - point at once, record who got the most', d.votingMode),
      vOpt('open', 'Open - tap each player\'s vote on the shared screen', d.votingMode),
      vOpt('secret', 'Secret - pass the device to vote privately', d.votingMode),
      '</select>',
      (dAnyBots() && d.votingMode === 'table'
        ? '<p class="small warn">With bots in the game, voting uses tap-to-vote (an in-person table vote can\'t include bots).</p>'
        : ''),
      checkboxRow('Reveal who voted for whom (open/secret)', 'revealVotes', d.revealVotes),
      '<label>If the vote ties</label>',
      '<select data-cfg-select="tieBreaker">',
      vOpt('dealer', 'The dealer casts the deciding vote', d.tieBreaker),
      vOpt('revote', 'Re-vote among the tied players', d.tieBreaker),
      vOpt('chameleon_escapes', 'No one is accused - the Chameleon escapes', d.tieBreaker),
      '</select>',
      stepperRow('Chameleon\'s guesses when caught', 'chameleonGuesses', d.chameleonGuesses, 1, 5),
      checkboxRow('Two guesses with exactly 3 players (rulebook)' + (threeP ? ' - active' : ''), 'threePlayerTwoGuesses', d.threePlayerTwoGuesses),

      '<div class="spacer"></div>',
      '<h3>Scoring</h3>',
      checkboxRow('Keep score (first to the target wins)', 'scoring', d.scoring),
      d.scoring ? [
        stepperRow('Points to win the match', 'winTarget', d.winTarget, 1, 20),
        stepperRow('Chameleon escapes undetected', 'scoreEscape', d.scoreEscape, 0, 10),
        stepperRow('Chameleon caught but guesses the word', 'scoreCaughtGuessed', d.scoreCaughtGuessed, 0, 10),
        stepperRow('Everyone else (Chameleon caught &amp; wrong)', 'scoreCaughtFailed', d.scoreCaughtFailed, 0, 10)
      ].join('') : '',

      '<div class="spacer"></div>',
      '<h3>Timers</h3>',
      '<label>Clue timer (per player - like the box\'s sand timer)</label>',
      timerSelect('clueTimer', d.clueTimer || 0, [0, 15, 30, 45, 60]),
      '<label>Debate timer</label>',
      timerSelect('debateTimer', d.debateTimer || 0, [0, 60, 90, 120, 180, 300]),
      '<p class="small muted">Timers are a visible countdown only - they never force the round on.</p>',

      '<div class="spacer"></div>',
      '<h3>Other</h3>',
      '<label>Who deals the next round</label>',
      '<select data-cfg-select="dealerRotation">',
      vOpt('chameleon', 'The Chameleon becomes next dealer (rulebook)', d.dealerRotation),
      vOpt('clockwise', 'Pass clockwise', d.dealerRotation),
      vOpt('random', 'Random each round', d.dealerRotation),
      '</select>',
      checkboxRow('Show A1-D4 grid coordinates (cosmetic)', 'showCoordinates', d.showCoordinates)
    ].join('');
  }

  function renderValidation(v) {
    if (v.ok && v.warnings.length === 0) {
      return '<div class="note small">Ready to play.</div>';
    }
    var out = [];
    v.errors.forEach(function (e) { out.push('<div class="err">⛔ ' + esc(e) + '</div>'); });
    v.warnings.forEach(function (w) { out.push('<div class="warn">⚠ ' + esc(w) + '</div>'); });
    return '<div style="margin:12px 0">' + out.join('') + '</div>';
  }

  function editionOption(val, label, cur) { return '<option value="' + val + '"' + (cur === val ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function vOpt(val, label, cur) { return '<option value="' + val + '"' + (cur === val ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function timerSelect(path, cur, presets) {
    return '<select data-cfg-select="' + path + '" data-num="1">' + presets.map(function (p) {
      var label = p === 0 ? 'Off' : (p < 60 ? (p + ' sec') : (p % 60 === 0 ? (p / 60 + ' min') : (Math.floor(p / 60) + ' min ' + (p % 60) + ' s')));
      return '<option value="' + p + '"' + (cur === p ? ' selected' : '') + '>' + label + '</option>';
    }).join('') + '</select>';
  }

  function stepperRow(label, path, val, min, max) {
    // Disable -/+ at the bounds so the control itself enforces valid ranges
    // (e.g. Chameleon count can't exceed what the player count allows).
    return [
      '<label>' + label + '</label>',
      '<div class="stepper" data-stepper="' + path + '" data-min="' + min + '" data-max="' + max + '">',
      '<button data-step="-1"' + (val <= min ? ' disabled' : '') + '>-</button>',
      '<div class="val">' + val + '</div>',
      '<button data-step="1"' + (val >= max ? ' disabled' : '') + '>+</button>',
      '</div>'
    ].join('');
  }
  function checkboxRow(label, path, val) {
    return '<div class="row" style="margin-top:12px"><div class="grow small">' + label + '</div>' +
      '<button class="iconbtn" data-toggle="' + path + '">' + (val ? 'On' : 'Off') + '</button></div>';
  }

  // ===========================================================================
  // GAME
  // ===========================================================================
  function renderGame() {
    if (G.phase === 'reveal') return renderReveal();
    if (G.phase === 'game_over') return renderGameOver();

    var body;
    switch (G.phase) {
      case 'clues': body = renderClues(); break;
      case 'debate': body = renderDebate(); break;
      case 'vote': body = renderVote(); break;
      case 'tally': body = renderTally(); break;
      case 'guess': body = renderGuess(); break;
      case 'round_over': body = renderRoundOver(); break;
      default: body = '<div class="panel">Unknown phase: ' + esc(G.phase) + '</div>';
    }
    var canRecheck = ['clues', 'debate', 'vote'].indexOf(G.phase) !== -1 &&
      G.players.some(function (q) { return !q.isBot; });
    var rightBtns = (canRecheck ? '<button class="iconbtn" data-action="recheck">Recheck</button> ' : '') +
      '<button class="iconbtn" data-action="viewLog">Log</button> <button class="iconbtn" data-action="menu">Menu</button>';
    return [
      topbar('Round ' + G.round + ' · ' + esc(G.topic.name), rightBtns),
      G.config.scoring ? renderScorebar() : '',
      body
    ].join('');
  }

  function renderScorebar() {
    var lead = CH.matchLeaders(G);
    var chips = CH.standings(G).map(function (s) {
      var isLead = lead.atMax.indexOf(s.id) !== -1 && s.score > 0;
      return '<span class="sc' + (isLead ? ' lead' : '') + '">' + dn(s.id) + ' <b>' + s.score + '</b></span>';
    }).join('');
    return '<div class="panel tight"><div class="scorebar">' + chips + '</div></div>';
  }

  // ---- grid component ----------------------------------------------------
  function renderGrid(topic, opts) {
    opts = opts || {};
    var isPic = topic.type === 'picture';
    var n = topic.items.length;
    var coords = opts.coords && (n % 4 === 0);

    function cellHtml(i) {
      var cls = 'cell' + (isPic ? ' pic' : '');
      if (opts.secretIndex === i) cls += ' secret';
      if (opts.wrong && opts.wrong.indexOf(i) !== -1) cls += ' wrong';
      if (opts.revealIndex === i && opts.secretIndex !== i) cls += ' reveal';
      var attrs = '';
      if (opts.pick && (!opts.wrong || opts.wrong.indexOf(i) === -1)) {
        cls += ' pick'; attrs = ' data-action="' + opts.pick + '" data-arg="' + i + '"';
      }
      // pictures use bundled OpenMoji art when available; esc() neutralises any
      // HTML in custom items and leaves emoji glyphs untouched.
      var content = isPic ? artHtml(topic.items[i]) : esc(topic.items[i]);
      return '<div class="' + cls + '"' + attrs + '>' + content + '</div>';
    }

    if (!coords) {
      var cells = [];
      for (var i = 0; i < n; i++) cells.push(cellHtml(i));
      return '<div class="grid">' + cells.join('') + '</div>';
    }

    // coordinate gutter: blank corner + A B C D, then row number + 4 cells.
    var letters = ['A', 'B', 'C', 'D'];
    var out = ['<div class="coord-h"></div>'];
    for (var c = 0; c < 4; c++) out.push('<div class="coord-h">' + letters[c] + '</div>');
    var rows = n / 4;
    for (var r = 0; r < rows; r++) {
      out.push('<div class="coord-h">' + (r + 1) + '</div>');
      for (var cc = 0; cc < 4; cc++) out.push(cellHtml(r * 4 + cc));
    }
    return '<div class="grid coords">' + out.join('') + '</div>';
  }

  function gridFaceDown() {
    return '<div class="panel center"><div style="font-size:40px">🃏</div><p class="small muted">The grid is face-down for the debate (house variant). It comes back if the Chameleon is caught and has to guess.</p></div>';
  }

  // ---- Reveal ------------------------------------------------------------
  function renderReveal() {
    if (ui.revealIdx == null) { ui.revealIdx = 0; ui.revealShown = false; ui.revealExpired = false; ui.revealIntro = true; }

    if (ui.revealIntro) {
      var chamN = G.config.chameleonCount;
      return [
        topbar('Secret reveal', ''),
        '<div class="panel center">',
        '<h2>Pass the device around</h2>',
        '<p class="muted">Each player privately sees the secret ' + (G.topic.type === 'picture' ? 'picture' : 'word') +
        ' - except the Chameleon. Hand the phone to the first player and don\'t let anyone else see the screen.' +
        (gAnyBots() ? ' 🤖 Bots already know their role - you\'ll only pass for human players.' : '') + '</p>',
        '<div class="note">Topic: <b>' + esc(G.topic.name) + '</b> · ' +
        (chamN === 1 ? 'there is <b>1 Chameleon</b>' : 'there are <b>' + chamN + ' Chameleons</b>') + ' among you.</div>',
        '<p class="small muted">' + dn(G.dealerId) + ' is the dealer and will start the clues.</p>',
        '</div>',
        '<button class="btn primary" data-action="revealStart">Begin reveal</button>'
      ].join('');
    }

    // Only humans need the private reveal; bots already "know" their role.
    var players = G.players.filter(function (q) { return !q.isBot; });
    if (ui.revealIdx >= players.length) {
      return [
        topbar('Secret reveal', ''),
        '<div class="panel center"><h2>Everyone\'s in</h2>',
        '<p class="muted">Put the device where everyone can see it. ' + dn(G.dealerId) +
        ' starts - going clockwise, each player says one word linked to the secret ' +
        (G.topic.type === 'picture' ? 'picture' : 'word') + '.</p></div>',
        '<button class="btn primary" data-action="beginPlay">Start the round</button>'
      ].join('');
    }

    var p = players[ui.revealIdx];
    if (!ui.revealShown && !ui.revealExpired) {
      return passScreen(p.name, 'Make sure only ' + esc(p.name) + ' can see the screen.',
        'I am ' + esc(p.name) + ' - show me', 'revealShow');
    }
    if (ui.revealExpired) {
      return [
        topbar('Secret reveal', ''),
        '<div class="panel center"><div style="font-size:42px">🙈</div><h2>Hidden</h2>' +
        '<p class="muted">Time\'s up - ' + esc(p.name) + '\'s secret is hidden again so no one else sees it.</p></div>',
        '<button class="btn" data-action="revealAgain">Show me again</button>',
        '<button class="btn primary" data-action="revealNext">Hide &amp; pass on</button>'
      ].join('');
    }
    return [
      topbar('Secret reveal', ''),
      privateSecretCard(p.id),
      countdownHtml(),
      '<button class="btn primary" data-action="revealNext">Hide &amp; pass on</button>'
    ].join('');
  }

  // The private secret/role card - shared by the initial reveal and recheck.
  // ONLY ever rendered behind a pass-the-device gate; never on a shared screen.
  function privateSecretCard(playerId) {
    var info = CH.revealInfo(G, playerId);
    var isPic = G.topic.type === 'picture';
    if (info.isChameleon) {
      var allies = (info.allies && info.allies.length)
        ? '<div class="note">Your fellow Chameleon(s): <b>' + info.allies.map(esc).join(', ') + '</b></div>' : '';
      return [
        '<div class="rolecard cham">',
        '<div class="lead">' + esc(nameOf(playerId)) + ', you are the</div>',
        '<div class="big">🦎 CHAMELEON</div>',
        '<div class="small">Blend in. You do NOT know the secret ' + (isPic ? 'picture' : 'word') +
        ' - work it out from everyone\'s clues.</div>',
        '</div>',
        allies,
        '<p class="small muted center">Here is the full grid (everyone can see it). Pick a clue that could fit any of these - but not so vague you get caught.</p>',
        renderGrid(G.topic, { coords: G.config.showCoordinates })
      ].join('');
    }
    var s = info.secret;
    var secretBox = isPic
      ? '<div class="secretemoji">' + artHtml(s.item) + '</div>'
      : '<div class="secretword">' + esc(s.item) + '</div>';
    return [
      '<div class="rolecard know">',
      '<div class="lead">' + esc(nameOf(playerId)) + ', the secret ' + (isPic ? 'picture' : 'word') + ' is</div>',
      secretBox,
      '<div class="small">Say a clue that proves you know it - but don\'t make it so obvious the Chameleon catches on.</div>',
      '</div>',
      renderGrid(G.topic, { secretIndex: s.index, coords: G.config.showCoordinates })
    ].join('');
  }

  // ---- Recheck (private, timed re-view of your secret during play) --------
  function renderRecheck() {
    var rc = ui.recheck || (ui.recheck = { stage: 'select' });
    if (rc.stage === 'select') {
      var humans = G.players.filter(function (q) { return !q.isBot; });
      var btns = humans.map(function (q) {
        return '<button class="btn ghost" data-action="recheckPick" data-arg="' + q.id + '">' + esc(q.name) + '</button>';
      }).join('');
      return [
        topbar('Recheck secret', '<button class="iconbtn" data-action="recheckDone">Back</button>'),
        '<div class="panel">',
        '<h2>Recheck your secret</h2>',
        '<p class="muted">Forgotten it? Pass the device to the player who needs it, then tap their name - only they should look. It hides again on a timer.</p>',
        btns,
        '</div>'
      ].join('');
    }
    var rp = CH.getPlayer(G, rc.playerId);
    if (rc.stage === 'gate') {
      return passScreen(rp.name, 'Make sure only ' + esc(rp.name) + ' can see the screen.',
        'I am ' + esc(rp.name) + ' - show me', 'recheckShow');
    }
    if (rc.stage === 'expired') {
      return [
        topbar('Recheck secret', ''),
        '<div class="panel center"><div style="font-size:42px">🙈</div><h2>Hidden</h2>' +
        '<p class="muted">Hidden again so no one else sees it.</p></div>',
        '<button class="btn" data-action="recheckShow">Show again</button>',
        '<button class="btn primary" data-action="recheckDone">Done</button>'
      ].join('');
    }
    return [ // stage 'show'
      topbar('Recheck secret', ''),
      privateSecretCard(rc.playerId),
      countdownHtml(),
      '<button class="btn primary" data-action="recheckDone">Done</button>'
    ].join('');
  }

  // ---- Clues -------------------------------------------------------------
  function renderClues() {
    var giverId = CH.currentClueGiver(G);
    var total = G.clueOrder.length;
    var n = G.clueIdx + 1;
    var isPic = G.topic.type === 'picture';
    var bot = isBotId(giverId);
    var entry = G.config.recordClues || gAnyBots(); // clues are shown on-screen when bots play

    if (bot && ui.pendingBotClueFor !== giverId) {
      ui.pendingBotClue = CHBOT.decideClue(G, giverId);
      ui.pendingBotClueFor = giverId;
    }

    var recapRows = '';
    if (entry) {
      var said = G.clueOrder.slice(0, G.clueIdx).map(function (id) {
        return '<div class="kv"><span>' + dn(id) + '</span><span class="lime">' + esc(G.clues[id] || '-') + '</span></div>';
      }).join('');
      if (said) recapRows = '<div class="panel tight"><h3>Clues so far</h3>' + said + '</div>';
    }
    var strip = G.clueOrder.map(function (id, i) {
      var cls = i < G.clueIdx ? 'o done' : (i === G.clueIdx ? 'o now' : 'o');
      return '<span class="' + cls + '">' + dn(id) + (i < G.clueIdx ? ' ✓' : '') + '</span>';
    }).join('');
    var nextLabel = (n >= total ? (G.config.debatePhase ? 'Done - to the debate' : 'Done - to the vote') : 'Next player');

    var middle;
    if (bot) {
      middle = [
        '<p class="muted">🤖 ' + esc(nameOf(giverId)) + ' says</p>',
        '<div style="font-size:26px;font-weight:800;color:var(--accent);margin:6px 0">“' + esc(ui.pendingBotClue) + '”</div>',
        '<button class="btn primary" data-action="nextClue">' + nextLabel + '</button>'
      ].join('');
    } else {
      var input = entry
        ? '<label>' + esc(nameOf(giverId)) + '\'s clue (one word)</label><input type="text" id="clueInput" maxlength="40" placeholder="' +
            (gAnyBots() ? 'type the word you say out loud' : 'say it out loud, then type it') + '" />'
        : '';
      middle = [
        '<p class="muted">Say one word linked to the secret ' + (isPic ? 'picture' : 'word') + '. Then tap next.</p>',
        G.config.clueTimer > 0 ? timerHtml('Clue timer', G.config.clueTimer) : '',
        input,
        '<button class="btn primary" data-action="nextClue">' + nextLabel + '</button>'
      ].join('');
    }

    return [
      renderGrid(G.topic, { coords: G.config.showCoordinates }),
      '<div class="panel center">',
      '<h3 style="margin-bottom:4px">Clue ' + n + ' of ' + total + '</h3>',
      '<div class="clue-turn">' + dn(giverId) + '</div>',
      '<div class="order">' + strip + '</div>',
      middle,
      '</div>',
      recapRows
    ].join('');
  }

  // ---- Debate ------------------------------------------------------------
  function renderDebate() {
    return [
      G.config.hideGridDuringDebate ? gridFaceDown() : renderGrid(G.topic, { coords: G.config.showCoordinates }),
      '<div class="panel center">',
      '<h2>Debate</h2>',
      '<p class="muted">Argue it out. Whose clue felt off? Who hesitated? When you\'re ready, take the vote.</p>',
      G.config.debateTimer > 0 ? timerHtml('Debate timer', G.config.debateTimer) : '',
      '<button class="btn primary" data-action="startVote">Go to the vote</button>',
      '</div>'
    ].join('');
  }

  // ---- Voting ------------------------------------------------------------
  function renderVote() {
    var mode = G.config.votingMode;
    if (gAnyBots() && mode === 'table') mode = 'open'; // an IRL table vote can't include bots
    var revote = G.lastVotes && G.lastVotes.revote;
    var head = revote ? '<div class="note small">Re-vote among the tied players.</div>' : '';
    if (mode === 'table') return [head, renderTableVote()].join('');
    return [head, renderSeqVote(mode === 'secret')].join('');
  }

  function renderTableVote() {
    if (!ui.tablePick) ui.tablePick = {};
    var btns = G.players.map(function (p) {
      var on = !!ui.tablePick[p.id];
      return '<button class="btn' + (on ? ' lime' : ' ghost') + '" data-action="tablePick" data-arg="' + p.id + '">' + esc(p.name) + '</button>';
    }).join('');
    var count = Object.keys(ui.tablePick).filter(function (k) { return ui.tablePick[k]; }).length;
    var hint = count > 1 ? '<p class="small warn">Tie of ' + count + ' players - resolved by your tie-break setting.</p>' : '';
    return [
      '<div class="panel">',
      '<h2>Who is the Chameleon?</h2>',
      '<p class="muted">Everyone points at once. Tap the player with the most votes (or all players if it\'s a tie).</p>',
      btns,
      hint,
      '<button class="btn primary" data-action="tableConfirm"' + (count >= 1 ? '' : ' disabled') + '>Accuse</button>',
      '</div>'
    ].join('');
  }

  function renderSeqVote(secret) {
    var voter = G.players[ui.voteIdx];
    if (!voter) return '<div class="panel center"><p class="muted">Tallying...</p></div>';
    if (voter.isBot) return '<div class="panel center"><p class="muted">🤖 bots are voting...</p></div>'; // pumped past in practice
    if (secret && ui.voterGate) {
      return passScreen(voter.name, 'Vote privately for who you think the Chameleon is.',
        'I am ' + esc(voter.name) + ' - vote', 'voteReveal');
    }
    var btns = G.players.filter(function (p) { return p.id !== voter.id; }).map(function (p) {
      return '<button class="btn ghost" data-action="seqVote" data-arg="' + p.id + '">' + dn(p.id) + '</button>';
    }).join('');
    return [
      '<div class="panel">',
      '<h2>' + esc(voter.name) + ', who is the Chameleon?</h2>',
      '<p class="muted">' + (secret ? 'No peeking - ' : 'Everyone can see - ') + 'tap your suspect.</p>',
      btns,
      '<p class="small muted center">' + (ui.voteIdx + 1) + ' of ' + G.players.length + ' voting</p>',
      '</div>'
    ].join('');
  }

  // ---- Tally / accusation reveal ----------------------------------------
  function renderTally() {
    var votesBlock = '';
    if (G.lastVotes && !G.lastVotes.manual && G.config.revealVotes && G.lastVotes.ballots) {
      var rows = G.players.map(function (p) {
        var s = G.lastVotes.ballots[p.id];
        return '<div class="kv"><span>' + dn(p.id) + '</span><span class="muted">→ ' + (s ? dn(s) : '-') + '</span></div>';
      }).join('');
      votesBlock = '<div class="panel tight"><h3>How everyone voted</h3>' + rows + '</div>';
    }
    return [
      votesBlock,
      '<div class="panel center">',
      '<h2>The table accuses</h2>',
      '<div class="clue-turn">' + dn(G.accusedId) + '</div>',
      '<p class="muted">Moment of truth. Reveal whether they are the Chameleon.</p>',
      '<button class="btn primary" data-action="revealAccused">Reveal ' + esc(nameOf(G.accusedId)) + '\'s identity</button>',
      '</div>'
    ].join('');
  }

  // ---- Guess -------------------------------------------------------------
  function renderGuess() {
    var what = (G.topic.type === 'picture' ? 'picture' : 'word');
    var head = '<div class="banner cham"><h1 style="margin:0;color:var(--lime)">CAUGHT! 🦎</h1>' +
      '<p class="muted" style="margin:8px 0 0">' + dn(G.accusedId) + ' is the Chameleon - but can still escape.</p></div>';
    if (isBotId(G.accusedId)) {
      return [
        head,
        '<div class="panel center">',
        '<h2>🤖 ' + esc(nameOf(G.accusedId)) + ' takes a guess</h2>',
        '<p class="muted"><b>' + G.guessesLeft + '</b> guess' + (G.guessesLeft === 1 ? '' : 'es') + ' left.</p>',
        renderGrid(G.topic, { wrong: G.guessHistory, coords: G.config.showCoordinates }),
        '<button class="btn primary" data-action="botGuessStep">Reveal the guess</button>',
        '</div>'
      ].join('');
    }
    return [
      head,
      '<div class="panel">',
      '<h2>Guess the secret ' + what + '</h2>',
      '<p class="muted">' + esc(nameOf(G.accusedId)) + ', tap your guess. ' +
      '<b>' + G.guessesLeft + '</b> guess' + (G.guessesLeft === 1 ? '' : 'es') + ' left.</p>',
      renderGrid(G.topic, { pick: 'guess', wrong: G.guessHistory, coords: G.config.showCoordinates }),
      '</div>'
    ].join('');
  }

  // ---- Round over --------------------------------------------------------
  function renderRoundOver() {
    var out = G.outcome;
    var playersWin = out === 'caught_failed';
    var bannerCls = playersWin ? 'players' : 'cham';
    var title = out === 'escaped_undetected' ? 'CHAMELEON ESCAPES'
      : out === 'caught_guessed' ? 'CHAMELEON ESCAPES' : 'CHAMELEON CAUGHT';
    var sub = CH.OUTCOMES[out] || '';
    var chamLine = 'The Chameleon ' + (G.chameleonIds.length > 1 ? 's were ' : 'was ') +
      G.chameleonIds.map(function (id) { return dn(id); }).join(', ') + '.';

    var deltas = '';
    if (G.config.scoring) {
      var rows = CH.standings(G).map(function (s, i) {
        var d = G.roundScores[s.id] || 0;
        return '<div class="kv"><span><span class="pos">' + (i + 1) + '.</span>' + dn(s.id) + '</span>' +
          '<span><b>' + s.score + '</b>' + (d ? ' <span class="delta">+' + d + '</span>' : '') + '</span></div>';
      }).join('');
      deltas = '<div class="panel"><h3>Standings (to ' + G.config.winTarget + ')</h3>' + rows + '</div>';
    }

    return [
      topbar('Round ' + G.round + ' result', '<button class="iconbtn" data-action="viewLog">Log</button>'),
      '<div class="banner ' + bannerCls + '"><h1 style="margin:0;color:' + (playersWin ? 'var(--accent)' : 'var(--lime)') + '">' +
      title + '</h1><p class="muted" style="margin:8px 0 0">' + esc(sub) + '</p></div>',
      '<div class="panel center">',
      '<p>The secret ' + (G.topic.type === 'picture' ? 'picture' : 'word') + ' was</p>',
      G.topic.type === 'picture' ? '<div class="secretemoji">' + artHtml(CH.secretItem(G)) + '</div>'
        : '<div class="secretword">' + esc(CH.secretItem(G)) + '</div>',
      '<p class="small muted">' + chamLine + '</p>',
      renderGrid(G.topic, { secretIndex: G.secretIndex, coords: G.config.showCoordinates }),
      '</div>',
      deltas,
      '<button class="btn primary" data-action="nextRound">Next round</button>',
      '<button class="btn ghost" data-action="home">End match</button>'
    ].join('');
  }

  // ---- Game over ---------------------------------------------------------
  function renderGameOver() {
    var winners = (G.winnerIds || []).map(function (id) { return dn(id); });
    var rows = CH.standings(G).map(function (s, i) {
      var win = (G.winnerIds || []).indexOf(s.id) !== -1;
      return '<div class="kv"><span><span class="pos">' + (i + 1) + '.</span>' + dn(s.id) + (win ? ' 🏆' : '') + '</span><span><b>' + s.score + '</b></span></div>';
    }).join('');
    return [
      topbar('Match over', ''),
      '<div class="banner players"><h1 style="margin:0;color:var(--lime)">' +
      winners.join(' & ') + ' win' + (winners.length > 1 ? '' : 's') + '!</h1>' +
      '<p class="muted" style="margin:8px 0 0">First to ' + G.config.winTarget + ' points.</p></div>',
      '<div class="panel"><h3>Final standings</h3>' + rows + '</div>',
      '<button class="btn primary" data-action="rematch">Play again (same players)</button>',
      '<button class="btn" data-action="newgame">New game</button>',
      '<button class="btn ghost" data-action="home">Home</button>'
    ].join('');
  }

  // ---- Log ---------------------------------------------------------------
  function renderLog() {
    var items = G.log.slice().reverse().map(function (e) {
      return '<div class="li">R' + e.round + ' · ' + esc(e.text) + '</div>';
    }).join('');
    return [
      topbar('Round log', '<button class="iconbtn" data-action="backToGame">Back</button>'),
      '<div class="panel"><div class="log-list">' + (items || '<span class="muted">No events yet.</span>') + '</div></div>'
    ].join('');
  }

  // ===========================================================================
  // CUSTOM TOPICS
  // ===========================================================================
  function renderCustomList() {
    var list = loadCustom();
    var rows = list.length ? list.map(function (t, i) {
      return '<div class="pl"><span class="grow">' + esc(t.name) + ' <span class="tag">' + t.type + '</span>' +
        '<span class="tag">' + esc(catLabel(t.category)) + '</span><span class="small muted">' + t.items.length + ' items</span></span>' +
        '<button class="iconbtn" data-action="editCustom" data-arg="' + i + '">Edit</button> ' +
        '<button class="iconbtn" data-action="deleteCustom" data-arg="' + i + '">✕</button></div>';
    }).join('') : '<p class="small muted">No custom topics yet. Make your own word list or emoji grid - like the dry-wipe custom card.</p>';
    return [
      topbar('Custom topics', '<button class="iconbtn" data-action="' + (view === 'custom' && G ? 'backToGame' : 'home') + '">Back</button>'),
      '<div class="panel"><div class="players">' + rows + '</div></div>',
      '<button class="btn primary" data-action="newCustom">+ New custom topic</button>'
    ].join('');
  }

  function renderCustomEdit() {
    var d = ui.customDraft;
    var catOpts = Object.keys(CONTENT.CATEGORIES).map(function (c) {
      return '<option value="' + c + '"' + (d.category === c ? ' selected' : '') + '>' + esc(catLabel(c)) + '</option>';
    }).join('');
    var placeholder = d.type === 'picture'
      ? 'One emoji per line, e.g.\n🐘\n🦊\n🐢\n...  (aim for 16)'
      : 'One word per line, e.g.\nPizza\nPasta\nEggs\n...  (aim for 16)';
    var count = parseItems(d.itemsText, d.type).length;
    return [
      topbar(d.index == null ? 'New topic' : 'Edit topic', '<button class="iconbtn" data-action="customTopics">Cancel</button>'),
      '<div class="panel">',
      '<label>Name</label>',
      '<input type="text" id="ctName" maxlength="24" value="' + esc(d.name) + '" placeholder="e.g. Office Things" />',
      '<label>Type</label>',
      '<select data-cfg-select="customType">',
      '<option value="word"' + (d.type === 'word' ? ' selected' : '') + '>Word (text)</option>',
      '<option value="picture"' + (d.type === 'picture' ? ' selected' : '') + '>Picture (emoji)</option>',
      '</select>',
      '<label>Category</label>',
      '<select data-cfg-select="customCat">' + catOpts + '</select>',
      '<label>Items (' + count + ' - aim for 16)</label>',
      '<textarea id="ctItems" rows="9" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);background:#0a110b;color:var(--text);font-size:15px" placeholder="' + esc(placeholder) + '">' + esc(d.itemsText) + '</textarea>',
      '</div>',
      renderCustomValidation(d),
      '<button class="btn primary" data-action="saveCustom">Save topic</button>'
    ].join('');
  }

  function parseItems(text, type) {
    var parts = ('' + (text || '')).split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return parts;
  }

  function renderCustomValidation(d) {
    var items = parseItems(d.itemsText, d.type);
    var errs = [], warns = [];
    if (!d.name.trim()) errs.push('Give the topic a name.');
    if (items.length < 4) errs.push('Add at least 4 items (16 is ideal for a 4×4 grid).');
    if (items.length >= 4 && items.length < 16) warns.push('Only ' + items.length + ' items - 16 fills a 4×4 grid best.');
    if (items.length > 16) warns.push(items.length + ' items - more than 16 still works, it just makes a taller grid.');
    var out = [];
    errs.forEach(function (e) { out.push('<div class="err">⛔ ' + esc(e) + '</div>'); });
    warns.forEach(function (w) { out.push('<div class="warn">⚠ ' + esc(w) + '</div>'); });
    return out.length ? '<div style="margin:10px 0">' + out.join('') + '</div>' : '<div class="note small">Looks good.</div>';
  }

  // ---- shared bits -------------------------------------------------------
  function topbar(title, right) {
    return '<div class="topbar"><span class="title">' + esc(title) + '</span><span>' + (right || '') + '</span></div>';
  }
  function passScreen(name, instruction, buttonLabel, action) {
    return [
      '<div class="panel pass-screen">',
      '<p class="muted">Pass the device to</p>',
      '<div class="who">' + esc(name) + '</div>',
      '<p class="small muted">' + esc(instruction) + '</p>',
      '<button class="btn primary" data-action="' + action + '">' + buttonLabel + '</button>',
      '</div>'
    ].join('');
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================
  function handle(action, arg) {
    switch (action) {
      // navigation
      case 'home': view = 'home'; G = null; render(); break;
      case 'rules': view = 'rules'; render(); break;
      case 'newgame': draft = newDraft(draft ? draft.playerCount : 4); ui = {}; view = 'setup'; render(); break;
      case 'quickplay': {
        draft = newDraft();
        var qv = CH.validateConfig(draft, library());
        if (qv.ok) { ui = {}; saveConfig(); G = CH.newGame(draft, library(), seed()); view = 'game'; save(); render(); }
        else { ui = {}; view = 'setup'; render(); } // fall back to setup if last settings no longer validate
        break;
      }
      case 'resume': G = loadSaved(); ui = {}; view = 'game'; render(); if (G && G.phase === 'vote' && gAnyBots()) pumpVotes(); break;
      case 'menu': if (confirm('Quit to home? The match is saved and you can resume it.')) { view = 'home'; render(); } break;
      case 'viewLog': view = 'log'; render(); break;
      case 'backToGame': view = 'game'; render(); break;
      case 'backFromRules': view = 'home'; render(); break;

      // setup
      case 'toggleAdvanced': ui.advanced = !ui.advanced; render(); break;
      case 'resetDefaults': { var pc = draft.playerCount; var names = draft.playerNames.slice(); draft = CH.defaultConfig(pc); draft.playerNames = names; draft.categories = categoriesForEdition(draft.edition); render(); break; }
      case 'startGame': startGame(); break;

      // reveal (timed: auto-hides after revealSeconds; can re-show or pass on)
      case 'revealStart': ui.revealIntro = false; render(); break;
      case 'revealShow': ui.revealShown = true; ui.revealExpired = false; render(); break;
      case 'revealAgain': ui.revealShown = true; ui.revealExpired = false; render(); break;
      case 'revealNext': ui.revealIdx++; ui.revealShown = false; ui.revealExpired = false; render(); break;
      case 'beginPlay': CH.beginClues(G); save(); ui = {}; render(); break;

      // recheck (private, timed re-view of a player's secret during play)
      case 'recheck': ui.recheck = { stage: 'select' }; view = 'recheck'; render(); break;
      case 'recheckPick': ui.recheck = { stage: 'gate', playerId: arg }; render(); break;
      case 'recheckShow': ui.recheck.stage = 'show'; render(); break;
      case 'recheckDone': ui.recheck = null; view = 'game'; render(); break;

      // clues
      case 'nextClue': {
        var giver = CH.currentClueGiver(G);
        var word = null;
        if (isBotId(giver)) word = ui.pendingBotClue;
        else if (G.config.recordClues || gAnyBots()) { var el = document.getElementById('clueInput'); word = el ? el.value : ''; }
        CH.nextClue(G, word);
        ui.pendingBotClue = null; ui.pendingBotClueFor = null;
        if (G.phase === 'vote' && gAnyBots()) { pumpVotes(); } else { save(); render(); }
        break;
      }

      // debate
      case 'startVote': CH.beginVote(G); ui.tablePick = {}; ui.voteIdx = 0; ui.voterGate = true; if (gAnyBots()) { pumpVotes(); } else { save(); render(); } break;
      case 'restartTimer': render(); break;

      // voting - table
      case 'tablePick': { if (!ui.tablePick) ui.tablePick = {}; ui.tablePick[arg] = !ui.tablePick[arg]; render(); break; }
      case 'tableConfirm': {
        var ids = Object.keys(ui.tablePick).filter(function (k) { return ui.tablePick[k]; });
        CH.resolveVotesManual(G, ids.length === 1 ? ids[0] : ids);
        afterVoteResolve(); break;
      }
      // voting - open/secret
      case 'voteReveal': ui.voterGate = false; render(); break;
      case 'seqVote': {
        var voter = G.players[ui.voteIdx];
        CH.castVote(G, voter.id, arg);
        ui.voteIdx++; ui.voterGate = true;
        if (gAnyBots()) { pumpVotes(); break; }
        if (ui.voteIdx >= G.players.length) { CH.resolveVotes(G); afterVoteResolve(); }
        else { save(); render(); }
        break;
      }

      // accusation reveal + guess
      case 'revealAccused': CH.revealAccused(G); save(); render(); break;
      case 'guess': CH.chameleonGuess(G, parseInt(arg, 10)); save(); render(); break;
      case 'botGuessStep': CH.chameleonGuess(G, CHBOT.decideGuess(G, G.accusedId)); save(); render(); break;

      // round / match flow
      case 'nextRound': CH.nextRound(G, library()); save(); ui = {}; render(); break;
      case 'rematch': G = CH.rematch(G, library(), seed()); ui = {}; save(); render(); break;

      // custom topics
      case 'customTopics': view = 'custom'; render(); break;
      case 'newCustom': ui.customDraft = { index: null, name: '', type: 'word', category: 'food', itemsText: '' }; view = 'customEdit'; render(); break;
      case 'editCustom': { var list = loadCustom(); var t = list[parseInt(arg, 10)]; ui.customDraft = { index: parseInt(arg, 10), name: t.name, type: t.type, category: t.category, itemsText: t.items.join('\n') }; view = 'customEdit'; render(); break; }
      case 'deleteCustom': { if (confirm('Delete this custom topic?')) { var l = loadCustom(); l.splice(parseInt(arg, 10), 1); saveCustom(l); render(); } break; }
      case 'saveCustom': doSaveCustom(); break;
    }
  }

  // After any vote resolution: the engine may go to tally, back to vote (revote),
  // or straight to a conclusion (tie => chameleon escapes). Reset vote UI on revote.
  function afterVoteResolve() {
    if (G.phase === 'vote') { ui.voteIdx = 0; ui.voterGate = true; ui.tablePick = {}; if (gAnyBots()) { pumpVotes(); return; } }
    save(); render();
  }

  // Bot games: auto-cast votes for bot seats, resolve when all are in, loop on
  // revote, and stop at a human voter (or once the vote concludes). Renders once.
  function pumpVotes() {
    var guard = 0;
    while (guard++ < 80) {
      if (G.phase !== 'vote') break;
      var voter = G.players[ui.voteIdx];
      if (ui.voteIdx < G.players.length && voter && voter.isBot) {
        CH.castVote(G, voter.id, CHBOT.decideVote(G, voter.id));
        ui.voteIdx++; ui.voterGate = true;
        continue;
      }
      if (ui.voteIdx >= G.players.length) {
        CH.resolveVotes(G);
        if (G.phase === 'vote') { ui.voteIdx = 0; ui.voterGate = true; } // revote round
        continue;
      }
      break; // a human needs to vote
    }
    save(); render();
  }

  function startGame() {
    normalizeDraft(draft);
    var v = CH.validateConfig(draft, library());
    if (!v.ok) { render(); return; }
    saveConfig();
    G = CH.newGame(draft, library(), seed());
    ui = {};
    view = 'game';
    save();
    render();
  }

  function doSaveCustom() {
    var d = ui.customDraft;
    // pull latest field values from the DOM
    var nameEl = document.getElementById('ctName');
    var itemsEl = document.getElementById('ctItems');
    if (nameEl) d.name = nameEl.value;
    if (itemsEl) d.itemsText = itemsEl.value;
    var items = parseItems(d.itemsText, d.type);
    if (!d.name.trim() || items.length < 4) { render(); return; }
    var topic = {
      id: d.index == null ? ('custom-' + seed().toString(36)) : (loadCustom()[d.index].id),
      name: d.name.trim(), type: d.type, category: d.category, items: items, custom: true
    };
    var list = loadCustom();
    if (d.index == null) list.push(topic); else list[d.index] = topic;
    saveCustom(list);
    view = 'custom';
    render();
  }

  // ===========================================================================
  // INPUT WIRING (delegated)
  // ===========================================================================
  app.addEventListener('click', function (e) {
    var stepBtn = e.target.closest('.stepper button');
    if (stepBtn) { onStep(stepBtn); return; }
    var toggle = e.target.closest('[data-toggle]');
    if (toggle) { onToggle(toggle.getAttribute('data-toggle')); return; }
    var cat = e.target.closest('[data-cat]');
    if (cat) { onCategory(cat.getAttribute('data-cat')); return; }
    var botBtn = e.target.closest('[data-bot]');
    if (botBtn) { onBotToggle(parseInt(botBtn.getAttribute('data-bot'), 10)); return; }
    var act = e.target.closest('[data-action]');
    if (act) { handle(act.getAttribute('data-action'), act.getAttribute('data-arg')); return; }
  });

  // text inputs that must not trigger a re-render (keep focus): patch in place.
  app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-name-idx')) {
      draft.playerNames[parseInt(t.getAttribute('data-name-idx'), 10)] = t.value;
    }
  });

  // selects
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.hasAttribute || !t.hasAttribute('data-cfg-select')) return;
    var which = t.getAttribute('data-cfg-select');
    if (which === 'customType') { ui.customDraft.type = t.value; render(); return; }
    if (which === 'customCat') { ui.customDraft.category = t.value; return; }
    // setup config selects (numeric ones carry data-num)
    var val = t.hasAttribute('data-num') ? parseInt(t.value, 10) : t.value;
    setPath(draft, which, val);
    if (which === 'edition') draft.categories = categoriesForEdition(val);
    render();
  });

  function getPath(obj, path) { var ks = path.split('.'); for (var i = 0; i < ks.length; i++) obj = obj[ks[i]]; return obj; }
  function setPath(obj, path, val) { var ks = path.split('.'); for (var i = 0; i < ks.length - 1; i++) obj = obj[ks[i]]; obj[ks[ks.length - 1]] = val; }

  function onStep(btn) {
    var wrap = btn.closest('.stepper');
    var path = wrap.getAttribute('data-stepper');
    var min = parseInt(wrap.getAttribute('data-min'), 10);
    var max = parseInt(wrap.getAttribute('data-max'), 10);
    var delta = parseInt(btn.getAttribute('data-step'), 10);
    var cur = getPath(draft, path);
    var next = Math.max(min, Math.min(max, cur + delta));
    setPath(draft, path, next);
    normalizeDraft(draft); // re-assert player-count constraints after any change
    render();
  }

  function onToggle(path) {
    setPath(draft, path, !getPath(draft, path));
    render();
  }

  function onCategory(cat) {
    var avail = categoriesForEdition(draft.edition);
    if (!draft.categories) draft.categories = avail.slice();
    var i = draft.categories.indexOf(cat);
    if (i === -1) { draft.categories.push(cat); }
    else if (draft.categories.length > 1) { draft.categories.splice(i, 1); } // keep >=1 selected
    // (deselecting the last category is ignored, so the chips always reflect reality)
    render();
  }

  function pickBotName(d) {
    for (var k = 0; k < BOT_NAMES.length; k++) if (d.playerNames.indexOf(BOT_NAMES[k]) === -1) return BOT_NAMES[k];
    return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  }
  function onBotToggle(i) {
    if (!draft.bots) draft.bots = [];
    var nowBot = !draft.bots[i];
    draft.bots[i] = nowBot;
    var nm = (draft.playerNames[i] || '').trim();
    if (nowBot) { if (/^Player \d+$/.test(nm) || nm === '') draft.playerNames[i] = pickBotName(draft); }
    else { if (BOT_NAMES.indexOf(nm) !== -1) draft.playerNames[i] = 'Player ' + (i + 1); }
    render();
  }

  // ===========================================================================
  // RULES SCREEN
  // ===========================================================================
  function renderRules() {
    return [
      topbar('How to play', '<button class="iconbtn" data-action="backFromRules">Back</button>'),
      '<div class="panel"><h2>The idea</h2>',
      '<p class="small">Everyone is shown the same secret word (or picture) from a grid - everyone except the <b>Chameleon</b>, who has no idea what it is. In turn, each player says <b>one word</b> linked to the secret. The Chameleon has to fake it convincingly and figure out the secret from everyone else\'s clues.</p></div>',
      '<div class="panel"><h2>Each round</h2>',
      '<p class="small">1. <b>Reveal:</b> pass the device so each player privately sees the secret word - or learns they\'re the Chameleon.</p>',
      '<p class="small">2. <b>Clues:</b> clockwise from the dealer, everyone says one related word. Too obvious and the Chameleon guesses it; too vague and you look guilty.</p>',
      '<p class="small">3. <b>Debate &amp; vote:</b> argue, then everyone points at who they think the Chameleon is.</p>',
      '<p class="small">4. <b>Reveal:</b> if you accused the wrong person, the Chameleon escaped. If you caught them, they get a final chance - to guess the secret word.</p></div>',
      '<div class="panel"><h2>Winning &amp; scoring</h2>',
      '<p class="small">Chameleon escapes undetected: <b>Chameleon +2</b>. Caught but guesses the word: <b>Chameleon +1</b>. Caught and guesses wrong: <b>everyone else +2</b>. First to 5 points wins. (All values are configurable.)</p></div>',
      '<div class="panel"><h2>Variants built in</h2>',
      '<p class="small">• <b>3 players:</b> the Chameleon gets two guesses.<br>• <b>7-8 players:</b> hide the grid during the debate to make the Chameleon\'s guess harder.<br>• <b>Word</b> and <b>Picture (emoji)</b> editions, plus your own <b>custom topics</b>.</p></div>',
      '<div class="panel"><h2>🤖 Bots</h2>',
      '<p class="small">In setup, switch any seat to a <b>Bot</b> to fill empty seats or practice solo. Bots give clues, vote and guess - but they can\'t join the debate, so the best game is still all humans. Bots only play the built-in curated topics; pick a difficulty to taste.</p></div>',
      '<p class="tiny muted center">Picture-edition artwork by <b>OpenMoji</b> - the open-source emoji project - licensed CC BY-SA 4.0.</p>',
      '<button class="btn primary" data-action="backFromRules">Got it</button>'
    ].join('');
  }

  // ===========================================================================
  // BOOT
  // ===========================================================================
  function boot() { render(); }

  // Test hook for the headless smoke test (bypasses the DOM event layer).
  var hook = {
    handle: handle,
    render: function () {},
    state: function () { return { view: view, G: G, draft: draft, ui: ui }; },
    setG: function (g) { G = g; },
    setView: function (v) { view = v; },
    setDraft: function (d) { draft = d; }
  };
  try { window.__CHUI = hook; } catch (e) {}
  if (typeof module !== 'undefined' && module.exports) module.exports = hook;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
