import React, { useState } from 'react';
import {
  Users,
  Bot,
  Crown,
  Sparkles,
  LogIn,
  LogOut,
  Copy,
  Check,
  Play,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { GoldCoinIllustration } from './StageArtwork';

export interface OnlineMatchDoc {
  matchId: string;
  hostId: string;
  status: 'waiting' | 'playing' | 'finished';
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  score1: number;
  score2: number;
  roundNumber: number;
  hiderSlot: 1 | 2;
  roundPhase: 'HIDING' | 'GUESSING' | 'REVEAL' | 'MATCH_OVER';
  coinHat: number;
  guessedHat: number;
  lastRoundWinnerSlot: 0 | 1 | 2;
  winnerSlot: 0 | 1 | 2;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TableSlotSummary {
  slotId: string;
  label: string;
  activeMatchId: string | null;
  match: OnlineMatchDoc | null;
}

interface MatchLobbyProps {
  currentUser: {
    uid: string;
    displayName: string | null;
    email: string | null;
  } | null;
  authLoading: boolean;
  selectedSlotId: string;
  tableSummaries: TableSlotSummary[];
  currentMatch: OnlineMatchDoc | null;
  busyAction: string | null;
  errorMessage: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSelectTableSlot: (slotId: string) => void;
  onJoinByMatchCode: (code: string) => Promise<void>;
  onPickSeat: (seat: 1 | 2) => Promise<void>;
  onLeaveSeat: () => Promise<void>;
  onCreateFreshTableLobby: () => Promise<void>;
  onStartOnlineMatch: () => Promise<void>;
  onStartSinglePlayer: () => void;
  onStartLocalPassAndPlay: () => void;
}

export const MatchLobby: React.FC<MatchLobbyProps> = ({
  currentUser,
  authLoading,
  selectedSlotId,
  tableSummaries,
  currentMatch,
  busyAction,
  errorMessage,
  onSignIn,
  onSignOut,
  onSelectTableSlot,
  onJoinByMatchCode,
  onPickSeat,
  onLeaveSeat,
  onCreateFreshTableLobby,
  onStartOnlineMatch,
  onStartSinglePlayer,
  onStartLocalPassAndPlay,
}) => {
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const isPlayer1Me = Boolean(currentUser && currentMatch?.player1Id === currentUser.uid);
  const isPlayer2Me = Boolean(currentUser && currentMatch?.player2Id === currentUser.uid);
  const isPlayer1Taken = Boolean(currentMatch && currentMatch.player1Id !== '');
  const isPlayer2Taken = Boolean(currentMatch && currentMatch.player2Id !== '');
  const bothSeatsFilled = isPlayer1Taken && isPlayer2Taken;
  const isParticipant = isPlayer1Me || isPlayer2Me;

  const handleCopyCode = () => {
    if (!currentMatch?.matchId) return;
    navigator.clipboard.writeText(currentMatch.matchId).catch(() => {});
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Lobby Header Banner & Auth Bar */}
      <section className="rounded-2xl bg-[#131E18] border border-white/10 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-amber-300 font-mono uppercase tracking-wider mb-2">
            <span>Live Parlor Matchmaking Lobby</span>
            <span aria-hidden="true">·</span>
            <span>First to 5 Wins</span>
          </div>
          <h1
            className="font-display text-2xl sm:text-4xl font-bold text-white"
            style={{ textWrap: 'balance' }}
          >
            Choose Your Seat or Play Solo
          </h1>
          <p className="text-sm sm:text-base text-stone-300 mt-2 leading-relaxed">
            Pick <strong>1st Player</strong> (hides the coin first) or <strong>2nd Player</strong>{' '}
            (guesses first) to match with a real online player in real time—or click the{' '}
            <strong>middle button for 1 Player Only</strong> against the Parlor Bot.
          </p>
        </div>

        {/* Player Identity / Auth Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          {authLoading ? (
            <div className="px-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-xs text-stone-400">
              Checking account...
            </div>
          ) : currentUser ? (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#0B120E] border border-white/10">
              <div className="text-left">
                <div className="text-xs text-stone-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Signed in for Live Matchmaking</span>
                </div>
                <div className="text-sm font-bold text-amber-200 truncate max-w-[180px]">
                  {currentUser.displayName || currentUser.email || 'Parlor Player'}
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="ml-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-stone-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span className="inline-flex items-center gap-1">
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In with Google for Online Lobby</span>
            </button>
          )}
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-xl bg-rose-950/80 border border-rose-400/40 px-4 py-3 text-sm text-rose-200 flex items-center justify-between gap-4">
          <span>{errorMessage}</span>
        </div>
      )}

      {/* THE THREE-BUTTON SEAT & MODE SELECTOR: [1st Player] — [1 Player Only (Middle)] — [2nd Player] */}
      <section className="rounded-2xl border-2 border-[#3E2723] felt-table-surface p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
        {/* Table Selection Bar & Match Code Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-300 mr-2">
              Live Parlor Tables:
            </span>
            {tableSummaries.map((table) => {
              const isSelected = selectedSlotId === table.slotId;
              const m = table.match;
              const count =
                (m?.player1Id ? 1 : 0) + (m?.player2Id ? 1 : 0);
              const statusLabel =
                m?.status === 'playing'
                  ? 'In Match'
                  : m?.status === 'waiting' && count > 0
                  ? `${count}/2 Waiting`
                  : 'Open';

              return (
                <button
                  key={table.slotId}
                  type="button"
                  onClick={() => onSelectTableSlot(table.slotId)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                    isSelected
                      ? 'bg-amber-400 text-stone-950 border-amber-300'
                      : 'bg-[#121D17]/90 text-stone-200 border-white/10 hover:border-amber-400/50'
                  }`}
                >
                  {table.label} · {statusLabel}
                </button>
              );
            })}
          </div>

          {/* Room Code Copy / Custom Code Join */}
          <div className="flex flex-wrap items-center gap-2">
            {currentMatch?.matchId && (
              <button
                type="button"
                onClick={handleCopyCode}
                title="Copy Match ID to share with a friend"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/35 hover:bg-black/50 border border-white/10 text-xs font-mono text-amber-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied: {currentMatch.matchId}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-stone-400" />
                    <span>Match ID: {currentMatch.matchId}</span>
                  </>
                )}
              </button>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customCodeInput.trim()) {
                  onJoinByMatchCode(customCodeInput.trim());
                  setCustomCodeInput('');
                }
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={customCodeInput}
                onChange={(e) => setCustomCodeInput(e.target.value)}
                placeholder="Enter Match ID..."
                maxLength={64}
                className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/15 text-xs font-mono text-white placeholder:text-stone-500 w-36 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => {
                  if (customCodeInput.trim()) {
                    onJoinByMatchCode(customCodeInput.trim());
                    setCustomCodeInput('');
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-stone-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                Join ID
              </button>
            </form>
          </div>
        </div>

        {/* 3-COLUMN SELECTION GRID: [1st Player] | [1 Player Only (Middle)] | [2nd Player] */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* LEFT CARD: PICK 1ST PLAYER */}
          <div
            className={`rounded-2xl p-6 flex flex-col justify-between border transition-colors ${
              isPlayer1Me
                ? 'bg-[#15281E]/95 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.2)]'
                : 'bg-[#101C16]/90 border-white/15'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-300">
                  Online Multiplayer Seat 1
                </span>
                <span className="text-xs font-mono text-stone-400">Hides Coin 1st</span>
              </div>

              <h2 className="font-display text-2xl font-bold text-white mb-2">
                1st Player
              </h2>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed mb-5">
                Start Round 1 behind the closed velvet blanket and hide the gold coin under one of
                the 3 hats first.
              </p>

              {/* Current Seat Occupant Status */}
              <div className="rounded-xl bg-black/35 border border-white/10 p-4 mb-6">
                <div className="text-xs text-stone-400 mb-1">Current 1st Player Seat:</div>
                {isPlayer1Taken ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-amber-200 truncate">
                      {currentMatch?.player1Name}
                      {isPlayer1Me ? ' (You)' : ''}
                    </span>
                    <span className="text-xs font-mono text-emerald-300 shrink-0">Ready</span>
                  </div>
                ) : (
                  <div className="text-sm font-medium text-stone-400">
                    Open Seat · Waiting for player to pick 1st Player
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={
                busyAction !== null ||
                (isPlayer1Taken && !isPlayer1Me) ||
                currentMatch?.status === 'playing'
              }
              onClick={() => (isPlayer1Me ? onLeaveSeat() : onPickSeat(1))}
              className={`w-full py-3.5 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                isPlayer1Me
                  ? 'bg-white/15 hover:bg-white/25 text-amber-200 cursor-pointer'
                  : isPlayer1Taken
                  ? 'bg-white/5 text-stone-500 cursor-not-allowed'
                  : 'bg-amber-400 hover:bg-amber-300 text-stone-950 cursor-pointer shadow-[0_0_20px_rgba(251,191,36,0.3)]'
              }`}
            >
              <Crown className="w-4 h-4" />
              <span>
                {busyAction === 'seat-1'
                  ? 'Claiming 1st Player...'
                  : isPlayer1Me
                  ? 'Seated as 1st Player (Click to Leave)'
                  : isPlayer1Taken
                  ? `Claimed by ${currentMatch?.player1Name}`
                  : 'Pick 1st Player'}
              </span>
            </button>
          </div>

          {/* MIDDLE CARD: 1 PLAYER ONLY (Instant Solo Mode vs Parlor Bot) */}
          <div className="rounded-2xl p-6 flex flex-col justify-between bg-[#1B120F]/95 border-2 border-amber-400/70 shadow-[0_12px_36px_rgba(0,0,0,0.6)]">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-300">
                  Instant Solo Mode
                </span>
                <span className="text-xs font-mono text-amber-200/80">No Waiting</span>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <GoldCoinIllustration size={42} glowing />
                <h2 className="font-display text-2xl font-bold text-amber-100">
                  1 Player Only
                </h2>
              </div>

              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed mb-5">
                Play immediately against the Parlor Bot! Take turns closing the blanket, hiding the
                gold coin under 3 hats, and guessing to 5 wins.
              </p>

              <div className="rounded-xl bg-black/35 border border-amber-400/20 p-4 mb-6 text-xs text-stone-300 space-y-1.5">
                <div>· Play right away with zero lobby wait</div>
                <div>· Alternate hiding &amp; finding the coin every round</div>
                <div>· Also supports 2-Player Local Pass &amp; Play on 1 screen</div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onStartSinglePlayer}
                className="w-full py-3.5 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-[0_0_24px_rgba(251,191,36,0.4)] whitespace-nowrap shrink-0"
              >
                <Bot className="w-4 h-4" />
                <span>Play 1 Player Only (vs. Bot)</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onStartLocalPassAndPlay}
                className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-stone-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Or Play 2 Players on Same Device</span>
              </button>
            </div>
          </div>

          {/* RIGHT CARD: PICK 2ND PLAYER */}
          <div
            className={`rounded-2xl p-6 flex flex-col justify-between border transition-colors ${
              isPlayer2Me
                ? 'bg-[#15281E]/95 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.2)]'
                : 'bg-[#101C16]/90 border-white/15'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-emerald-300">
                  Online Multiplayer Seat 2
                </span>
                <span className="text-xs font-mono text-stone-400">Guesses Hat 1st</span>
              </div>

              <h2 className="font-display text-2xl font-bold text-white mb-2">
                2nd Player
              </h2>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed mb-5">
                Guess where 1st Player hid the coin when the blanket opens in Round 1, then hide the
                coin yourself in Round 2!
              </p>

              {/* Current Seat Occupant Status */}
              <div className="rounded-xl bg-black/35 border border-white/10 p-4 mb-6">
                <div className="text-xs text-stone-400 mb-1">Current 2nd Player Seat:</div>
                {isPlayer2Taken ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-emerald-200 truncate">
                      {currentMatch?.player2Name}
                      {isPlayer2Me ? ' (You)' : ''}
                    </span>
                    <span className="text-xs font-mono text-emerald-300 shrink-0">Ready</span>
                  </div>
                ) : (
                  <div className="text-sm font-medium text-stone-400">
                    Open Seat · Waiting for player to pick 2nd Player
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={
                busyAction !== null ||
                (isPlayer2Taken && !isPlayer2Me) ||
                currentMatch?.status === 'playing'
              }
              onClick={() => (isPlayer2Me ? onLeaveSeat() : onPickSeat(2))}
              className={`w-full py-3.5 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                isPlayer2Me
                  ? 'bg-white/15 hover:bg-white/25 text-emerald-200 cursor-pointer'
                  : isPlayer2Taken
                  ? 'bg-white/5 text-stone-500 cursor-not-allowed'
                  : 'bg-emerald-400 hover:bg-emerald-300 text-stone-950 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.3)]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {busyAction === 'seat-2'
                  ? 'Claiming 2nd Player...'
                  : isPlayer2Me
                  ? 'Seated as 2nd Player (Click to Leave)'
                  : isPlayer2Taken
                  ? `Claimed by ${currentMatch?.player2Name}`
                  : 'Pick 2nd Player'}
              </span>
            </button>
          </div>
        </div>

        {/* BOTTOM LOBBY MATCHMAKING STATUS & START MATCH BAR */}
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            {bothSeatsFilled ? (
              <div className="text-sm sm:text-base font-bold text-amber-200">
                Both Seats Filled! 1st Player ({currentMatch?.player1Name}) vs. 2nd Player (
                {currentMatch?.player2Name})
              </div>
            ) : isPlayer1Taken || isPlayer2Taken ? (
              <div className="text-sm text-stone-200">
                Waiting for an actual second player to join this table and claim{' '}
                <strong className="text-amber-300">
                  {isPlayer1Taken ? '2nd Player' : '1st Player'}
                </strong>
                ...
              </div>
            ) : (
              <div className="text-sm text-stone-300">
                Select <strong>Pick 1st Player</strong> or <strong>Pick 2nd Player</strong> above to
                open a seat, or choose <strong>1 Player Only</strong> in the middle.
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onCreateFreshTableLobby}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-stone-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Create Fresh Table Lobby</span>
            </button>

            {bothSeatsFilled && isParticipant && (
              <button
                type="button"
                onClick={onStartOnlineMatch}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm shadow-[0_0_24px_rgba(251,191,36,0.5)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {busyAction === 'start-match'
                    ? 'Starting Match...'
                    : 'Start Online Match (First to 5 Wins)'}
                </span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
