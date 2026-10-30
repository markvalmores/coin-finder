import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Trophy,
  Eye,
  EyeOff,
  RotateCcw,
  ArrowRight,
  Check,
  X,
  Users,
  Bot,
  HelpCircle,
  History,
} from 'lucide-react';
import { GoldCoinIllustration, ParlorHatIllustration, HAT_META } from './components/StageArtwork';
import { sound } from './utils/sound';

type GameMode = 'PASS_AND_PLAY' | 'VS_CPU';

type RoundPhase =
  | 'BLANKET_CLOSED_PRIVACY' // Blanket is shut; in 2P mode Seeker looks away before Hider peeks behind blanket (or Hider uses secret keys 1/2/3)
  | 'BLANKET_CLOSED_HIDING'  // Hider is behind the closed blanket choosing which of the 3 hats gets the coin
  | 'CPU_HIDING_BEHIND_BLANKET' // Blanket is shut while CPU hides the coin
  | 'BLANKET_OPEN_GUESSING'  // Blanket opens! Seeker chooses one of the 3 hats
  | 'ROUND_REVEAL'           // Chosen hat lifts (and actual coin hat lifts if missed); +1 point awarded
  | 'MATCH_OVER';            // A player reached 5 wins!

interface RoundRecord {
  roundNumber: number;
  hiderIndex: 0 | 1;
  seekerIndex: 0 | 1;
  coinHat: number;
  guessedHat: number;
  seekerFoundCoin: boolean;
  pointWinnerIndex: 0 | 1;
}

const WINNING_SCORE = 5;

export default function App() {
  // Game mode and players
  const [gameMode, setGameMode] = useState<GameMode>('PASS_AND_PLAY');
  const [playerNames, setPlayerNames] = useState<[string, string]>(['Player 1', 'Player 2']);
  const [editingNames, setEditingNames] = useState(false);

  // Scores and Turn Tracking
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [roundNumber, setRoundNumber] = useState<number>(1);
  // 0 = Player 1 hides, Player 2 guesses; 1 = Player 2 hides, Player 1 guesses
  const [hiderIndex, setHiderIndex] = useState<0 | 1>(0);
  const seekerIndex: 0 | 1 = hiderIndex === 0 ? 1 : 0;

  // Round State Machine
  const [phase, setPhase] = useState<RoundPhase>('BLANKET_CLOSED_HIDING');
  const [selectedHideHat, setSelectedHideHat] = useState<number | null>(null);
  const [coinHat, setCoinHat] = useState<number | null>(null);
  const [guessedHat, setGuessedHat] = useState<number | null>(null);
  const [hoveredHat, setHoveredHat] = useState<number | null>(null);
  const [revealActualCoinHat, setRevealActualCoinHat] = useState<boolean>(false);

  // Options & UI Panels
  const [privacyStepEnabled, setPrivacyStepEnabled] = useState<boolean>(false);
  const [instantOpenBlanket, setInstantOpenBlanket] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [activeDrawer, setActiveDrawer] = useState<'NONE' | 'RULES' | 'HISTORY'>('NONE');
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);

  // Timers cleanup ref
  const timersRef = useRef<number[]>([]);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  const scheduleTimer = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(fn, delayMs);
    timersRef.current.push(id);
    return id;
  }, []);

  // Toggle sound
  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.enabled = next;
  };

  // Switch between 2-Player Pass & Play and 1-Player vs CPU
  const handleModeChange = (mode: GameMode) => {
    clearAllTimers();
    setGameMode(mode);
    setPlayerNames(mode === 'VS_CPU' ? ['Player 1', 'Parlor Bot'] : ['Player 1', 'Player 2']);
    setScores([0, 0]);
    setRoundNumber(1);
    setHiderIndex(0);
    setSelectedHideHat(null);
    setCoinHat(null);
    setGuessedHat(null);
    setRevealActualCoinHat(false);
    setRoundHistory([]);
    sound.playBlanketClose();
    setPhase(mode === 'PASS_AND_PLAY' && privacyStepEnabled ? 'BLANKET_CLOSED_PRIVACY' : 'BLANKET_CLOSED_HIDING');
  };

  // Full match reset
  const handleResetMatch = () => {
    clearAllTimers();
    setScores([0, 0]);
    setRoundNumber(1);
    setHiderIndex(0);
    setSelectedHideHat(null);
    setCoinHat(null);
    setGuessedHat(null);
    setRevealActualCoinHat(false);
    setRoundHistory([]);
    sound.playBlanketClose();
    setPhase(
      gameMode === 'PASS_AND_PLAY' && privacyStepEnabled
        ? 'BLANKET_CLOSED_PRIVACY'
        : 'BLANKET_CLOSED_HIDING'
    );
  };

  // Step 1A: Hider steps behind the closed blanket (when privacy guard is active)
  const handlePeekBehindBlanket = () => {
    sound.playHatLift();
    setPhase('BLANKET_CLOSED_HIDING');
  };

  // Step 1B: Hider locks the coin under a hat and opens the blanket for the Seeker
  const lockCoinAndOpenBlanket = useCallback(
    (hatIdx: number) => {
      clearAllTimers();
      setSelectedHideHat(hatIdx);
      setCoinHat(hatIdx);
      setGuessedHat(null);
      setRevealActualCoinHat(false);
      sound.playBlanketOpen();
      setPhase('BLANKET_OPEN_GUESSING');

      // If in VS_CPU mode and the Seeker is the CPU (hiderIndex === 0), CPU makes a guess after blanket opens
      if (gameMode === 'VS_CPU' && hiderIndex === 0) {
        scheduleTimer(() => {
          const cpuChoice = Math.floor(Math.random() * 3);
          handleSeekerGuess(cpuChoice, hatIdx);
        }, 1150);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearAllTimers, gameMode, hiderIndex, scheduleTimer]
  );

  // When Hider clicks one of the 3 hats behind the closed blanket
  const handleSelectHatToHide = (hatIdx: number) => {
    if (phase !== 'BLANKET_CLOSED_HIDING' && phase !== 'BLANKET_CLOSED_PRIVACY') return;
    sound.playCoinClink();
    setSelectedHideHat(hatIdx);

    if (instantOpenBlanket || phase === 'BLANKET_CLOSED_PRIVACY') {
      lockCoinAndOpenBlanket(hatIdx);
    }
  };

  // Step 2: Seeker clicks one of the 3 hats after the blanket opens
  const handleSeekerGuess = (chosenHatIdx: number, overrideCoinHat?: number) => {
    const activeCoinHat = overrideCoinHat !== undefined ? overrideCoinHat : coinHat;
    if (activeCoinHat === null) return;

    clearAllTimers();
    setGuessedHat(chosenHatIdx);
    setHoveredHat(null);
    sound.playHatLift();
    setPhase('ROUND_REVEAL');

    const foundCoin = chosenHatIdx === activeCoinHat;
    const winnerIndex: 0 | 1 = foundCoin ? seekerIndex : hiderIndex;

    if (foundCoin) {
      // Seeker guessed right! Seeker gets +1 point
      scheduleTimer(() => {
        sound.playGuessCorrect();
      }, 160);
    } else {
      // Seeker missed! Hider gets +1 point, and we lift the actual coin hat shortly after
      scheduleTimer(() => {
        setRevealActualCoinHat(true);
        sound.playGuessMiss();
      }, 420);
    }

    // Update score and history
    const nextScores: [number, number] = [...scores] as [number, number];
    nextScores[winnerIndex] += 1;
    setScores(nextScores);

    const record: RoundRecord = {
      roundNumber,
      hiderIndex,
      seekerIndex,
      coinHat: activeCoinHat,
      guessedHat: chosenHatIdx,
      seekerFoundCoin: foundCoin,
      pointWinnerIndex: winnerIndex,
    };
    setRoundHistory((prev) => [record, ...prev]);

    // Check if either player reached 5 wins
    if (nextScores[winnerIndex] >= WINNING_SCORE) {
      scheduleTimer(() => {
        sound.playMatchVictory();
        setPhase('MATCH_OVER');
      }, 1500);
    }
  };

  // Step 3: Advance to Next Round & Swap Roles (Seeker becomes Hider, Hider becomes Seeker)
  const handleNextRound = () => {
    clearAllTimers();
    const nextHider: 0 | 1 = hiderIndex === 0 ? 1 : 0;
    setHiderIndex(nextHider);
    setRoundNumber((r) => r + 1);
    setSelectedHideHat(null);
    setCoinHat(null);
    setGuessedHat(null);
    setRevealActualCoinHat(false);
    sound.playBlanketClose();

    if (gameMode === 'VS_CPU' && nextHider === 1) {
      // Parlor Bot's turn to hide the coin behind the closed blanket
      setPhase('CPU_HIDING_BEHIND_BLANKET');
      scheduleTimer(() => {
        sound.playCoinClink();
      }, 500);
      scheduleTimer(() => {
        const botChosenHat = Math.floor(Math.random() * 3);
        setCoinHat(botChosenHat);
        setSelectedHideHat(botChosenHat);
        sound.playBlanketOpen();
        setPhase('BLANKET_OPEN_GUESSING');
      }, 1350);
    } else {
      setPhase(
        gameMode === 'PASS_AND_PLAY' && privacyStepEnabled
          ? 'BLANKET_CLOSED_PRIVACY'
          : 'BLANKET_CLOSED_HIDING'
      );
    }
  };

  // Keyboard shortcuts (1, 2, 3 to hide or guess; Enter/Space to advance)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingNames) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const idx = parseInt(e.key, 10) - 1;
        if (phase === 'BLANKET_CLOSED_PRIVACY') {
          // Secretly hide coin and open blanket immediately without showing backstage view
          sound.playCoinClink();
          lockCoinAndOpenBlanket(idx);
        } else if (phase === 'BLANKET_CLOSED_HIDING') {
          handleSelectHatToHide(idx);
        } else if (phase === 'BLANKET_OPEN_GUESSING') {
          const isCpuGuessing = gameMode === 'VS_CPU' && seekerIndex === 1;
          if (!isCpuGuessing) {
            handleSeekerGuess(idx);
          }
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (phase === 'BLANKET_CLOSED_HIDING' && selectedHideHat !== null) {
          e.preventDefault();
          lockCoinAndOpenBlanket(selectedHideHat);
        } else if (
          phase === 'ROUND_REVEAL' &&
          scores[0] < WINNING_SCORE &&
          scores[1] < WINNING_SCORE
        ) {
          e.preventDefault();
          handleNextRound();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const hiderName = playerNames[hiderIndex];
  const seekerName = playerNames[seekerIndex];
  const isBlanketClosed =
    phase === 'BLANKET_CLOSED_PRIVACY' ||
    phase === 'BLANKET_CLOSED_HIDING' ||
    phase === 'CPU_HIDING_BEHIND_BLANKET';
  const isOpaqueBlanket =
    phase === 'BLANKET_CLOSED_PRIVACY' || phase === 'CPU_HIDING_BEHIND_BLANKET';
  const isCpuGuessingTurn =
    gameMode === 'VS_CPU' && seekerIndex === 1 && phase === 'BLANKET_OPEN_GUESSING';

  const latestRound = roundHistory[0];
  const matchWinnerIndex: 0 | 1 | null =
    scores[0] >= WINNING_SCORE ? 0 : scores[1] >= WINNING_SCORE ? 1 : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#0E1713] text-[#F4F1EA]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-white/10 bg-[#0A110E]/90 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#stage"
          onClick={(e) => {
            e.preventDefault();
            setActiveDrawer('NONE');
          }}
          className="font-display text-xl font-bold tracking-tight text-amber-100 whitespace-nowrap shrink-0"
        >
          Three Hats &amp; A Coin
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-300">
          <button
            type="button"
            onClick={() => setActiveDrawer('NONE')}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeDrawer === 'NONE' ? 'text-amber-200 underline' : ''
            }`}
          >
            Stage Table
          </button>
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'RULES' ? 'NONE' : 'RULES')}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeDrawer === 'RULES' ? 'text-amber-200 underline' : ''
            }`}
          >
            Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'HISTORY' ? 'NONE' : 'HISTORY')}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeDrawer === 'HISTORY' ? 'text-amber-200 underline' : ''
            }`}
          >
            Round Log ({roundHistory.length})
          </button>
          <button
            type="button"
            onClick={handleToggleSound}
            className="hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {soundEnabled ? 'Sound: On' : 'Sound: Off'}
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleResetMatch}
            className="px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Match
          </button>
        </div>
      </header>

      {/* Main Content Container (1440px baseline, generous padding) */}
      <main id="stage" className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6">
        {/* Top Scoreboard & Mode Controls Strip */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Player 1 Score Card */}
          <div
            className={`lg:col-span-4 rounded-xl p-4 border transition-colors flex flex-col justify-between ${
              (phase === 'BLANKET_CLOSED_HIDING' || phase === 'BLANKET_CLOSED_PRIVACY') &&
              hiderIndex === 0
                ? 'bg-[#17261F] border-amber-400/60'
                : phase === 'BLANKET_OPEN_GUESSING' && seekerIndex === 0
                ? 'bg-[#17261F] border-emerald-400/60'
                : 'bg-[#131E18] border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {editingNames ? (
                  <input
                    type="text"
                    value={playerNames[0]}
                    onChange={(e) => setPlayerNames([e.target.value, playerNames[1]])}
                    onBlur={() => setEditingNames(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingNames(false)}
                    className="bg-black/40 border border-amber-400/50 rounded px-2 py-0.5 text-sm font-semibold text-amber-100 w-36 focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingNames(true)}
                    title="Click to rename player"
                    className="text-base font-bold text-stone-100 hover:text-amber-200 truncate cursor-pointer"
                  >
                    {playerNames[0]}
                  </button>
                )}
                <span className="text-xs text-stone-400 whitespace-nowrap">
                  · {hiderIndex === 0 ? 'Hiding Coin' : 'Guessing Hat'}
                </span>
              </div>
              <div className="font-mono text-2xl font-bold text-amber-300 tabular-nums shrink-0">
                {scores[0]} <span className="text-xs font-normal text-stone-400">/ {WINNING_SCORE}</span>
              </div>
            </div>

            {/* 5-Win Progress Pips */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5" aria-label={`${playerNames[0]} score: ${scores[0]} of 5 wins`}>
                {Array.from({ length: WINNING_SCORE }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2.5 w-7 rounded-sm transition-colors ${
                      i < scores[0]
                        ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]'
                        : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-stone-400 font-mono tabular-nums whitespace-nowrap">
                {WINNING_SCORE - scores[0] > 0
                  ? `${WINNING_SCORE - scores[0]} to win`
                  : 'WINNER'}
              </span>
            </div>
          </div>

          {/* Center Match Status & Mode Selector */}
          <div className="lg:col-span-4 rounded-xl p-4 bg-[#131E18] border border-white/10 flex flex-col justify-between gap-3">
            {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
            <div className="flex items-center justify-center gap-2 text-xs text-stone-300 font-medium">
              <span className="font-mono tabular-nums text-amber-300 font-semibold">
                Round {roundNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span>First to {WINNING_SCORE} Wins</span>
              <span aria-hidden="true">·</span>
              <span>Roles Swap Every Turn</span>
            </div>

            {/* Segmented Mode Control (Interactive Filter/State Buttons) */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B120E] rounded-lg border border-white/5">
              <button
                type="button"
                onClick={() => handleModeChange('PASS_AND_PLAY')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameMode === 'PASS_AND_PLAY'
                    ? 'bg-amber-400 text-stone-950'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>2 Players (Turns)</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('VS_CPU')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameMode === 'VS_CPU'
                    ? 'bg-amber-400 text-stone-950'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span>1 Player vs Bot</span>
              </button>
            </div>
          </div>

          {/* Player 2 Score Card */}
          <div
            className={`lg:col-span-4 rounded-xl p-4 border transition-colors flex flex-col justify-between ${
              (phase === 'BLANKET_CLOSED_HIDING' ||
                phase === 'BLANKET_CLOSED_PRIVACY' ||
                phase === 'CPU_HIDING_BEHIND_BLANKET') &&
              hiderIndex === 1
                ? 'bg-[#17261F] border-amber-400/60'
                : phase === 'BLANKET_OPEN_GUESSING' && seekerIndex === 1
                ? 'bg-[#17261F] border-emerald-400/60'
                : 'bg-[#131E18] border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {editingNames && gameMode === 'PASS_AND_PLAY' ? (
                  <input
                    type="text"
                    value={playerNames[1]}
                    onChange={(e) => setPlayerNames([playerNames[0], e.target.value])}
                    onBlur={() => setEditingNames(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingNames(false)}
                    className="bg-black/40 border border-amber-400/50 rounded px-2 py-0.5 text-sm font-semibold text-amber-100 w-36 focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => gameMode === 'PASS_AND_PLAY' && setEditingNames(true)}
                    title={gameMode === 'PASS_AND_PLAY' ? 'Click to rename player' : undefined}
                    className="text-base font-bold text-stone-100 hover:text-amber-200 truncate cursor-pointer"
                  >
                    {playerNames[1]}
                  </button>
                )}
                <span className="text-xs text-stone-400 whitespace-nowrap">
                  · {hiderIndex === 1 ? 'Hiding Coin' : 'Guessing Hat'}
                </span>
              </div>
              <div className="font-mono text-2xl font-bold text-amber-300 tabular-nums shrink-0">
                {scores[1]} <span className="text-xs font-normal text-stone-400">/ {WINNING_SCORE}</span>
              </div>
            </div>

            {/* 5-Win Progress Pips */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5" aria-label={`${playerNames[1]} score: ${scores[1]} of 5 wins`}>
                {Array.from({ length: WINNING_SCORE }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2.5 w-7 rounded-sm transition-colors ${
                      i < scores[1]
                        ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]'
                        : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-stone-400 font-mono tabular-nums whitespace-nowrap">
                {WINNING_SCORE - scores[1] > 0
                  ? `${WINNING_SCORE - scores[1]} to win`
                  : 'WINNER'}
              </span>
            </div>
          </div>
        </section>

        {/* Collapsible Rules or Round History Panel when requested from Top Bar */}
        {activeDrawer === 'RULES' && (
          <section className="rounded-xl bg-[#131E18] border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-amber-200">
                How Three Hats &amp; A Coin Works
              </h2>
              <button
                type="button"
                onClick={() => setActiveDrawer('NONE')}
                className="text-xs text-stone-400 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Close Rules
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm text-stone-300">
              <div>
                <p className="font-semibold text-amber-300 mb-1">01. Blanket Closes</p>
                <p className="leading-relaxed">
                  At the start of each turn, the crimson velvet blanket closes across the stage so the
                  other player cannot see where the coin is placed.
                </p>
              </div>
              <div>
                <p className="font-semibold text-amber-300 mb-1">02. Hide the Gold Coin</p>
                <p className="leading-relaxed">
                  The Hider chooses Hat 1, Hat 2, or Hat 3 to hide the gold coin underneath, then opens
                  the blanket. (Tip: You can also press keys <span className="font-mono text-amber-200">1</span>,{' '}
                  <span className="font-mono text-amber-200">2</span>, or{' '}
                  <span className="font-mono text-amber-200">3</span>!)
                </p>
              </div>
              <div>
                <p className="font-semibold text-amber-300 mb-1">03. Guess the Hat</p>
                <p className="leading-relaxed">
                  Once the blanket opens, the Seeker picks one of the three hats. If the Seeker finds the
                  coin, the <strong>Seeker gets +1 point</strong>. If they miss, the{' '}
                  <strong>Hider gets +1 point</strong>!
                </p>
              </div>
              <div>
                <p className="font-semibold text-amber-300 mb-1">04. Swap Turns to 5 Wins</p>
                <p className="leading-relaxed">
                  After every round, roles swap—the player who just guessed now hides the coin behind the
                  blanket. The first player to reach <strong>5 points</strong> wins the game!
                </p>
              </div>
            </div>
          </section>
        )}

        {activeDrawer === 'HISTORY' && (
          <section className="rounded-xl bg-[#131E18] border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-amber-200">
                Round-by-Round Match Log
              </h2>
              <button
                type="button"
                onClick={() => setActiveDrawer('NONE')}
                className="text-xs text-stone-400 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Close Log
              </button>
            </div>
            {roundHistory.length === 0 ? (
              <p className="text-sm text-stone-400">
                No rounds completed yet. Hide the coin behind the blanket and complete Round 1!
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm font-mono tabular-nums">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-stone-400 font-sans">
                      <th className="py-2 pr-4">Round</th>
                      <th className="py-2 pr-4">Hider</th>
                      <th className="py-2 pr-4">Coin Hidden Under</th>
                      <th className="py-2 pr-4">Seeker Guessed</th>
                      <th className="py-2">Point Awarded To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {roundHistory.map((item) => (
                      <tr key={item.roundNumber} className="text-stone-200">
                        <td className="py-2.5 pr-4 text-amber-300">#{item.roundNumber}</td>
                        <td className="py-2.5 pr-4 font-sans">{playerNames[item.hiderIndex]}</td>
                        <td className="py-2.5 pr-4 font-sans">
                          Hat #{item.coinHat + 1} ({HAT_META[item.coinHat]?.name})
                        </td>
                        <td className="py-2.5 pr-4 font-sans">
                          Hat #{item.guessedHat + 1} ({HAT_META[item.guessedHat]?.name})
                        </td>
                        <td className="py-2.5 font-sans font-semibold text-amber-300">
                          {playerNames[item.pointWinnerIndex]} (
                          {item.seekerFoundCoin ? 'Found Coin' : 'Successful Bluff'})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* THE GRAND PARLOR STAGE & VELVET BLANKET ARENA */}
        <section className="relative flex-1 min-h-[520px] rounded-2xl border-2 border-[#3E2723] shadow-[0_24px_60px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col justify-between felt-table-surface">
          {/* Decorative Brass Corner Brackets & Stage Valance Trim */}
          <div className="relative z-30 flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 bg-[#1B110E]/95 border-b border-amber-500/25">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-300/90">
                {isBlanketClosed ? 'Blanket Closed' : 'Blanket Open'}
              </span>
              <span aria-hidden="true" className="text-stone-600">
                ·
              </span>
              <span className="text-sm font-medium text-stone-200">
                {phase === 'BLANKET_CLOSED_PRIVACY' &&
                  `${hiderName} is ready to hide the coin (${seekerName}, look away!)`}
                {phase === 'BLANKET_CLOSED_HIDING' &&
                  `Behind the Closed Blanket: ${hiderName}, choose a hat to hide the coin`}
                {phase === 'CPU_HIDING_BEHIND_BLANKET' &&
                  `${hiderName} closed the blanket and is hiding the coin...`}
                {phase === 'BLANKET_OPEN_GUESSING' &&
                  `Blanket Open! ${seekerName}, guess which hat hides ${hiderName}'s coin!`}
                {phase === 'ROUND_REVEAL' &&
                  latestRound &&
                  (latestRound.seekerFoundCoin
                    ? `${playerNames[latestRound.seekerIndex]} found the coin! +1 Point to ${playerNames[latestRound.seekerIndex]}`
                    : `${playerNames[latestRound.seekerIndex]} missed! +1 Point to ${playerNames[latestRound.hiderIndex]}`)}
                {phase === 'MATCH_OVER' &&
                  matchWinnerIndex !== null &&
                  `${playerNames[matchWinnerIndex]} reached ${WINNING_SCORE} wins and takes the match!`}
              </span>
            </div>

            {/* Pass-and-Play Helper Toggles for Hiding Behind the Blanket */}
            {gameMode === 'PASS_AND_PLAY' && (
              <div className="flex items-center gap-4 text-xs text-stone-300">
                <button
                  type="button"
                  onClick={() => {
                    const next = !privacyStepEnabled;
                    setPrivacyStepEnabled(next);
                    if (next && phase === 'BLANKET_CLOSED_HIDING' && selectedHideHat === null) {
                      setPhase('BLANKET_CLOSED_PRIVACY');
                    } else if (!next && phase === 'BLANKET_CLOSED_PRIVACY') {
                      setPhase('BLANKET_CLOSED_HIDING');
                    }
                  }}
                  className="flex items-center gap-1.5 hover:text-amber-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {privacyStepEnabled ? (
                    <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-stone-400" />
                  )}
                  <span>
                    Look-Away Screen: <strong>{privacyStepEnabled ? 'On' : 'Off'}</strong>
                  </span>
                </button>

                <span aria-hidden="true" className="text-stone-600">
                  ·
                </span>

                <button
                  type="button"
                  onClick={() => setInstantOpenBlanket(!instantOpenBlanket)}
                  className="hover:text-amber-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Auto-Open Blanket on Click:{' '}
                  <strong className="text-amber-300">{instantOpenBlanket ? 'On' : 'Off'}</strong>
                </button>
              </div>
            )}
          </div>

          {/* Translucent Backstage Cutaway Tint when Hider is peeking behind the closed blanket */}
          {phase === 'BLANKET_CLOSED_HIDING' && (
            <div
              className="absolute inset-0 pointer-events-none z-10 velvet-blanket-backstage border-x-[18px] border-[#6E1220]/70"
              aria-hidden="true"
            />
          )}

          {/* Left & Right Stage Blanket Curtains (animate closed or open with compositor transform) */}
          <div
            className="absolute inset-y-0 left-0 w-1/2 z-20 velvet-blanket-surface border-r-2 border-amber-400/50 shadow-[12px_0_36px_rgba(0,0,0,0.85)] transition-transform duration-300 ease-out pointer-events-none"
            style={{
              transform: isOpaqueBlanket
                ? 'translateX(0%)'
                : phase === 'BLANKET_CLOSED_HIDING'
                ? 'translateX(-88%)'
                : 'translateX(-100%)',
            }}
            aria-hidden="true"
          >
            {/* Gold braided bottom fringe */}
            <div className="absolute bottom-0 inset-x-0 h-3 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-600 opacity-80" />
          </div>

          <div
            className="absolute inset-y-0 right-0 w-1/2 z-20 velvet-blanket-surface border-l-2 border-amber-400/50 shadow-[-12px_0_36px_rgba(0,0,0,0.85)] transition-transform duration-300 ease-out pointer-events-none"
            style={{
              transform: isOpaqueBlanket
                ? 'translateX(0%)'
                : phase === 'BLANKET_CLOSED_HIDING'
                ? 'translateX(88%)'
                : 'translateX(100%)',
            }}
            aria-hidden="true"
          >
            {/* Gold braided bottom fringe */}
            <div className="absolute bottom-0 inset-x-0 h-3 bg-gradient-to-r from-amber-600 via-yellow-300 to-amber-500 opacity-80" />
          </div>

          {/* OPAQUE BLANKET OVERLAY CONTENT (Privacy Guard or CPU Hiding) */}
          {isOpaqueBlanket && (
            <div className="absolute inset-0 z-25 flex flex-col items-center justify-center p-6 text-center">
              <div className="max-w-lg w-full rounded-2xl bg-[#1A080C]/95 border border-amber-400/40 p-8 shadow-2xl">
                {phase === 'BLANKET_CLOSED_PRIVACY' ? (
                  <>
                    <p className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-2">
                      Round {roundNumber} · Blanket Closed
                    </p>
                    <h2
                      className="font-display text-2xl sm:text-3xl font-bold text-amber-100 mb-3"
                      style={{ textWrap: 'balance' }}
                    >
                      {seekerName}, Look Away! {hiderName} Needs to Hide the Coin.
                    </h2>
                    <p className="text-sm text-stone-300 mb-6 leading-relaxed">
                      The blanket is closed across the stage.{' '}
                      <strong className="text-amber-200">{hiderName}</strong>, either click below to
                      peek behind the blanket and place the coin, or secretly press key{' '}
                      <kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-amber-300">
                        1
                      </kbd>
                      ,{' '}
                      <kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-amber-300">
                        2
                      </kbd>
                      , or{' '}
                      <kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-amber-300">
                        3
                      </kbd>{' '}
                      on your keyboard right now!
                    </p>
                    <button
                      type="button"
                      onClick={handlePeekBehindBlanket}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{hiderName}: Step Behind Blanket to Hide Coin</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mb-4 flex justify-center">
                      <GoldCoinIllustration size={60} glowing />
                    </div>
                    <p className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-2">
                      Round {roundNumber} · Blanket Closed
                    </p>
                    <h2
                      className="font-display text-2xl sm:text-3xl font-bold text-amber-100 mb-2"
                      style={{ textWrap: 'balance' }}
                    >
                      {hiderName} is Hiding the Gold Coin Behind the Blanket...
                    </h2>
                    <p className="text-sm text-stone-300">
                      Listen closely! The blanket will open in a moment so you can guess which of the 3
                      hats holds the coin.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* STAGE INSTRUCTION HEADER BANNER (Visible when behind blanket or when blanket is open) */}
          <div className="relative z-15 pt-6 px-6 text-center">
            {phase === 'BLANKET_CLOSED_HIDING' && (
              <div className="max-w-2xl mx-auto">
                <p className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-1">
                  Step 1 of 2 · Blanket Closed (Backstage View for {hiderName})
                </p>
                <h1
                  className="font-display text-2xl sm:text-3xl font-bold text-white"
                  style={{ textWrap: 'balance' }}
                >
                  {hiderName}, Put the Gold Coin Into One of the 3 Hats
                </h1>
                <p className="text-sm text-stone-300 mt-1">
                  {seekerName} must not peek! Click Hat 1, Hat 2, or Hat 3 below to hide the coin, then
                  open the blanket.
                </p>
              </div>
            )}

            {phase === 'BLANKET_OPEN_GUESSING' && (
              <div className="max-w-2xl mx-auto">
                <p className="text-xs font-mono uppercase tracking-widest text-emerald-300 mb-1">
                  Step 2 of 2 · Blanket Open!
                </p>
                <h1
                  className="font-display text-2xl sm:text-3xl font-bold text-white"
                  style={{ textWrap: 'balance' }}
                >
                  {isCpuGuessingTurn
                    ? `${seekerName} is Inspecting the 3 Hats...`
                    : `${seekerName}, Guess Which Hat Has the Hidden Coin!`}
                </h1>
                <p className="text-sm text-stone-300 mt-1">
                  {isCpuGuessingTurn
                    ? `You hid the coin under Hat #${(coinHat ?? 0) + 1}. Let's see if ${seekerName} guesses right or misses!`
                    : `Click one of the 3 hats below to lift it. Find the coin for +1 point—or if you miss, ${hiderName} gets +1 point!`}
                </p>
              </div>
            )}

            {phase === 'ROUND_REVEAL' && latestRound && (
              <div className="max-w-2xl mx-auto">
                <p className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-1">
                  Round {latestRound.roundNumber} Result
                </p>
                <h1
                  className="font-display text-2xl sm:text-3xl font-bold text-white"
                  style={{ textWrap: 'balance' }}
                >
                  {latestRound.seekerFoundCoin
                    ? `${playerNames[latestRound.seekerIndex]} Found the Coin Under Hat #${
                        latestRound.coinHat + 1
                      }!`
                    : `${playerNames[latestRound.seekerIndex]} Missed! Coin Was Hidden Under Hat #${
                        latestRound.coinHat + 1
                      }!`}
                </h1>
                <p className="text-sm text-amber-200 font-medium mt-1">
                  +1 Point awarded to{' '}
                  <strong>{playerNames[latestRound.pointWinnerIndex]}</strong> · Next up:{' '}
                  {playerNames[latestRound.seekerIndex]} will hide the coin!
                </p>
              </div>
            )}
          </div>

          {/* THE 3 HATS ON THE STAGE TABLE */}
          <div className="relative z-15 my-auto py-8 px-4 sm:px-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10 max-w-4xl mx-auto items-end">
              {HAT_META.map((hat) => {
                const idx = hat.id;

                // Determine if this hat is lifted
                const isHiderPreviewingThisHat =
                  phase === 'BLANKET_CLOSED_HIDING' && selectedHideHat === idx;
                const isGuessedHatInReveal =
                  (phase === 'ROUND_REVEAL' || phase === 'MATCH_OVER') && guessedHat === idx;
                const isActualCoinHatRevealedOnMiss =
                  (phase === 'ROUND_REVEAL' || phase === 'MATCH_OVER') &&
                  revealActualCoinHat &&
                  coinHat === idx;

                const isHatLifted =
                  isHiderPreviewingThisHat || isGuessedHatInReveal || isActualCoinHatRevealedOnMiss;

                // Determine if the gold coin should be visible under this hat
                const showCoinUnderHat =
                  (phase === 'BLANKET_CLOSED_HIDING' && selectedHideHat === idx) ||
                  ((phase === 'ROUND_REVEAL' || phase === 'MATCH_OVER') && coinHat === idx && isHatLifted);

                const isInteractive =
                  phase === 'BLANKET_CLOSED_HIDING' ||
                  (phase === 'BLANKET_OPEN_GUESSING' && !isCpuGuessingTurn);

                return (
                  <div key={hat.id} className="flex flex-col items-center">
                    {/* Interactive Hat Stage Pedestal */}
                    <button
                      type="button"
                      disabled={!isInteractive}
                      onClick={() => {
                        if (phase === 'BLANKET_CLOSED_HIDING') {
                          handleSelectHatToHide(idx);
                        } else if (phase === 'BLANKET_OPEN_GUESSING' && !isCpuGuessingTurn) {
                          handleSeekerGuess(idx);
                        }
                      }}
                      onMouseEnter={() => isInteractive && setHoveredHat(idx)}
                      onMouseLeave={() => setHoveredHat(null)}
                      className={`group relative w-full max-w-[260px] pt-16 pb-5 px-4 rounded-2xl flex flex-col items-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        isInteractive ? 'cursor-pointer' : 'cursor-default'
                      } ${
                        isHiderPreviewingThisHat
                          ? 'bg-amber-400/10 border border-amber-400/50'
                          : isGuessedHatInReveal
                          ? guessedHat === coinHat
                            ? 'bg-emerald-500/15 border border-emerald-400/60'
                            : 'bg-rose-500/15 border border-rose-400/50'
                          : 'bg-black/15 hover:bg-black/25 border border-white/10'
                      }`}
                    >
                      {/* Felt Table Shadow & Hidden Coin Slot Underneath Hat */}
                      <div className="relative w-full h-36 flex items-end justify-center">
                        {/* Dark elliptical shadow on the felt table */}
                        <div
                          className="absolute bottom-2 w-40 h-7 rounded-full bg-black/65 blur-[2px] transition-transform duration-200"
                          style={{
                            transform: isHatLifted ? 'scale(0.78)' : 'scale(1)',
                          }}
                          aria-hidden="true"
                        />

                        {/* What lies underneath the hat when lifted */}
                        <div className="absolute bottom-3 z-10 flex flex-col items-center justify-center">
                          {showCoinUnderHat ? (
                            <div className="flex flex-col items-center animate-bounce">
                              <GoldCoinIllustration size={58} glowing />
                            </div>
                          ) : isGuessedHatInReveal && guessedHat !== coinHat ? (
                            <div className="flex items-center gap-1 text-xs font-mono font-bold text-rose-300 bg-rose-950/90 border border-rose-400/40 px-2.5 py-1 rounded">
                              <X className="w-3.5 h-3.5" />
                              <span>Empty Hat!</span>
                            </div>
                          ) : null}
                        </div>

                        {/* The 3D-styled SVG Parlor Hat resting over the spot */}
                        <div className="relative z-20 w-48">
                          <ParlorHatIllustration
                            hatIndex={idx}
                            isLifted={isHatLifted}
                            isSelected={
                              isHiderPreviewingThisHat ||
                              (phase === 'ROUND_REVEAL' && (guessedHat === idx || coinHat === idx))
                            }
                            isHovered={hoveredHat === idx}
                          />
                        </div>
                      </div>

                      {/* Hat Label & Action Affordance */}
                      <div className="mt-2 text-center">
                        <div className="text-sm font-bold text-stone-100 group-hover:text-amber-200 transition-colors">
                          Hat #{idx + 1} · {hat.name}
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          {phase === 'BLANKET_CLOSED_HIDING' &&
                            (selectedHideHat === idx ? (
                              <span className="text-amber-300 font-semibold">
                                Coin Placed Here (Key {hat.shortcut})
                              </span>
                            ) : (
                              <span>Click to Put Coin Here (Key {hat.shortcut})</span>
                            ))}
                          {phase === 'BLANKET_OPEN_GUESSING' &&
                            (isCpuGuessingTurn ? (
                              <span>Awaiting {seekerName}...</span>
                            ) : (
                              <span className="text-emerald-300 group-hover:underline">
                                Click to Guess Hat #{idx + 1} (Key {hat.shortcut})
                              </span>
                            ))}
                          {(phase === 'ROUND_REVEAL' || phase === 'MATCH_OVER') && (
                            <span>
                              {coinHat === idx && guessedHat === idx && (
                                <span className="text-emerald-300 font-semibold">
                                  Guessed &amp; Found Coin!
                                </span>
                              )}
                              {coinHat === idx && guessedHat !== idx && (
                                <span className="text-amber-300 font-semibold">
                                  Coin Was Hidden Here!
                                </span>
                              )}
                              {coinHat !== idx && guessedHat === idx && (
                                <span className="text-rose-300 font-semibold">
                                  Guessed (Missed)
                                </span>
                              )}
                              {coinHat !== idx && guessedHat !== idx && (
                                <span className="text-stone-500">Unchosen Hat</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* BOTTOM STAGE CONTROL DECK (Confirm Hide / Open Blanket / Next Turn Swap) */}
          <div className="relative z-25 px-6 py-4 bg-[#140D0B]/95 border-t border-amber-500/25 flex flex-wrap items-center justify-between gap-4">
            {/* Left status cue */}
            <div className="flex items-center gap-3">
              <GoldCoinIllustration size={36} />
              <div className="text-xs sm:text-sm">
                <span className="text-stone-400">Current Turn Roles: </span>
                <strong className="text-amber-300">{hiderName}</strong>
                <span className="text-stone-300"> hides the coin</span>
                <span className="mx-2 text-stone-600">·</span>
                <strong className="text-emerald-300">{seekerName}</strong>
                <span className="text-stone-300"> guesses the hat</span>
              </div>
            </div>

            {/* Right primary stage action button */}
            <div className="flex items-center gap-3">
              {phase === 'BLANKET_CLOSED_HIDING' && (
                <button
                  type="button"
                  disabled={selectedHideHat === null}
                  onClick={() => selectedHideHat !== null && lockCoinAndOpenBlanket(selectedHideHat)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
                    selectedHideHat !== null
                      ? 'bg-amber-400 hover:bg-amber-300 text-stone-950 shadow-[0_0_20px_rgba(251,191,36,0.4)] cursor-pointer'
                      : 'bg-white/10 text-stone-400 cursor-not-allowed'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {selectedHideHat !== null
                      ? `Hide Coin in Hat #${selectedHideHat + 1} & Open Blanket!`
                      : 'Select a Hat (1, 2, or 3) First'}
                  </span>
                </button>
              )}

              {phase === 'BLANKET_OPEN_GUESSING' && (
                <div className="text-xs sm:text-sm font-medium text-emerald-300 flex items-center gap-2">
                  <span>
                    {isCpuGuessingTurn
                      ? `${seekerName} is choosing a hat...`
                      : `${seekerName}: Click Hat 1, Hat 2, or Hat 3 above to reveal!`}
                  </span>
                </div>
              )}

              {phase === 'ROUND_REVEAL' && matchWinnerIndex === null && (
                <button
                  type="button"
                  onClick={handleNextRound}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm shadow-[0_0_20px_rgba(251,191,36,0.4)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>
                    Next Turn: Close Blanket ({seekerName} Hides Coin Next)
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {matchWinnerIndex !== null && (
                <button
                  type="button"
                  onClick={handleResetMatch}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Play Again (First to {WINNING_SCORE} Wins)</span>
                </button>
              )}
            </div>
          </div>

          {/* VICTORY MODAL OVERLAY WHEN A PLAYER REACHES 5 WINS */}
          {phase === 'MATCH_OVER' && matchWinnerIndex !== null && (
            <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="max-w-md w-full rounded-2xl bg-[#141E19] border-2 border-amber-400 p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.9)]">
                <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-400/20 border border-amber-400/50 flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-amber-300" />
                </div>
                <p className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-1">
                  First to {WINNING_SCORE} Wins · Match Complete
                </p>
                <h2
                  className="font-display text-3xl font-bold text-white mb-2"
                  style={{ textWrap: 'balance' }}
                >
                  {playerNames[matchWinnerIndex]} Wins the Game!
                </h2>
                <p className="text-sm text-stone-300 mb-6">
                  After {roundHistory.length} rounds of hiding and guessing behind the velvet blanket,{' '}
                  <strong className="text-amber-200">{playerNames[matchWinnerIndex]}</strong> reached{' '}
                  {WINNING_SCORE} points first!
                </p>

                {/* Final Score Summary Table */}
                <div className="rounded-xl bg-black/35 border border-white/10 p-4 mb-6 flex items-center justify-around font-mono tabular-nums">
                  <div>
                    <div className="text-xs font-sans text-stone-400">{playerNames[0]}</div>
                    <div className="text-2xl font-bold text-amber-300">{scores[0]} pts</div>
                  </div>
                  <div className="h-8 w-px bg-white/10" />
                  <div>
                    <div className="text-xs font-sans text-stone-400">{playerNames[1]}</div>
                    <div className="text-2xl font-bold text-amber-300">{scores[1]} pts</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetMatch}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Play Again</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Quiet Footer with Keyboard Shortcuts & Turn Summary */}
        <footer className="flex flex-wrap items-center justify-between gap-4 pt-2 pb-4 text-xs text-stone-400 border-t border-white/5">
          <div>
            Keyboard Controls: Press <span className="font-mono text-stone-200">1</span>,{' '}
            <span className="font-mono text-stone-200">2</span>, or{' '}
            <span className="font-mono text-stone-200">3</span> to select Hat 1, 2, or 3 · Press{' '}
            <span className="font-mono text-stone-200">Enter</span> or{' '}
            <span className="font-mono text-stone-200">Space</span> to open blanket or start next turn
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveDrawer(activeDrawer === 'RULES' ? 'NONE' : 'RULES')}
              className="inline-flex items-center gap-1 hover:text-stone-200 cursor-pointer whitespace-nowrap"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Game Rules</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveDrawer(activeDrawer === 'HISTORY' ? 'NONE' : 'HISTORY')}
              className="inline-flex items-center gap-1 hover:text-stone-200 cursor-pointer whitespace-nowrap"
            >
              <History className="w-3.5 h-3.5" />
              <span>Round History ({roundHistory.length})</span>
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
