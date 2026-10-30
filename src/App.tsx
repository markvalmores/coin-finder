import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Sparkles,
  Trophy,
  Eye,
  EyeOff,
  RotateCcw,
  ArrowRight,
  X,
  Users,
  Bot,
  HelpCircle,
  History,
  Globe,
} from 'lucide-react';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
  sanitizePlayerName,
  sanitizeMatchId,
  signInWithGoogle,
  logOutUser,
} from './firebase';
import { GoldCoinIllustration, ParlorHatIllustration, HAT_META } from './components/StageArtwork';
import { MatchLobby, OnlineMatchDoc, TableSlotSummary } from './components/MatchLobby';
import { sound } from './utils/sound';

type AppView = 'LOBBY' | 'STAGE';
type GameMode = 'ONLINE_FIREBASE' | 'VS_CPU' | 'PASS_AND_PLAY';

type RoundPhase =
  | 'BLANKET_CLOSED_PRIVACY'
  | 'BLANKET_CLOSED_HIDING'
  | 'CPU_HIDING_BEHIND_BLANKET'
  | 'BLANKET_OPEN_GUESSING'
  | 'ROUND_REVEAL'
  | 'MATCH_OVER';

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

const PUBLIC_SLOTS = [
  { slotId: 'slot-1', label: 'Table #1' },
  { slotId: 'slot-2', label: 'Table #2' },
  { slotId: 'slot-3', label: 'Table #3' },
  { slotId: 'slot-4', label: 'Table #4' },
];

function generateUniqueMatchId(prefix = 'match'): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${suffix}`;
}

export default function App() {
  // Primary navigation view: Starts in LOBBY so players see 1st Player | 1 Player Only | 2nd Player
  const [view, setView] = useState<AppView>('LOBBY');
  const [gameMode, setGameMode] = useState<GameMode>('ONLINE_FIREBASE');

  // Firebase Auth & Matchmaking State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('slot-1');
  const [slotPointers, setSlotPointers] = useState<Record<string, string>>({});
  const [slotMatches, setSlotMatches] = useState<Record<string, OnlineMatchDoc>>({});
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [onlineMatch, setOnlineMatch] = useState<OnlineMatchDoc | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // Local / Solo Game State (for 1 Player Only vs Bot and Local 2-Player Pass & Play)
  const [playerNames, setPlayerNames] = useState<[string, string]>(['Player 1', 'Parlor Bot']);
  const [editingNames, setEditingNames] = useState(false);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [hiderIndex, setHiderIndex] = useState<0 | 1>(0);
  const [phase, setPhase] = useState<RoundPhase>('BLANKET_CLOSED_HIDING');
  const [selectedHideHat, setSelectedHideHat] = useState<number | null>(null);
  const [coinHat, setCoinHat] = useState<number | null>(null);
  const [guessedHat, setGuessedHat] = useState<number | null>(null);
  const [hoveredHat, setHoveredHat] = useState<number | null>(null);
  const [revealActualCoinHat, setRevealActualCoinHat] = useState<boolean>(false);

  // Options & Drawers
  const [privacyStepEnabled, setPrivacyStepEnabled] = useState<boolean>(false);
  const [instantOpenBlanket, setInstantOpenBlanket] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [activeDrawer, setActiveDrawer] = useState<'NONE' | 'RULES' | 'HISTORY'>('NONE');
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);

  const timersRef = useRef<number[]>([]);
  const prevOnlineRoundRef = useRef<{ roundNumber: number; roundPhase: string }>({
    roundNumber: 0,
    roundPhase: '',
  });

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

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Listen to the 4 Public Lobby Slot Pointers (/lobbySlots/slot-1 .. slot-4) when authenticated
  useEffect(() => {
    if (authLoading || !currentUser) {
      setSlotPointers({});
      setSlotMatches({});
      return;
    }

    const unsubs = PUBLIC_SLOTS.map(({ slotId }) => {
      const slotPath = `lobbySlots/${slotId}`;
      return onSnapshot(
        doc(db, 'lobbySlots', slotId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (typeof data.activeMatchId === 'string' && data.activeMatchId) {
              setSlotPointers((prev) => ({ ...prev, [slotId]: data.activeMatchId }));
            }
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, slotPath);
        }
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authLoading, currentUser]);

  // 3. Sync activeMatchId with selectedSlotId when user selects a table
  useEffect(() => {
    const pointedMatchId = slotPointers[selectedSlotId];
    if (pointedMatchId) {
      setActiveMatchId(pointedMatchId);
    }
  }, [selectedSlotId, slotPointers]);

  // 4. Listen to each table's active Match document so the Lobby table tabs show live player counts
  useEffect(() => {
    if (authLoading || !currentUser) return;
    const matchIds = Array.from(new Set(Object.values(slotPointers).filter(Boolean)));
    if (matchIds.length === 0) return;

    const unsubs = matchIds.map((mId) => {
      const path = `matches/${mId}`;
      return onSnapshot(
        doc(db, 'matches', mId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as OnlineMatchDoc;
            setSlotMatches((prev) => ({ ...prev, [mId]: data }));
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, path);
        }
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authLoading, currentUser, slotPointers]);

  // 5. Listen to the currently focused `activeMatchId` for live seat selection and gameplay sync
  useEffect(() => {
    if (authLoading || !currentUser || !activeMatchId) {
      setOnlineMatch(null);
      return;
    }

    const path = `matches/${activeMatchId}`;
    const unsub = onSnapshot(
      doc(db, 'matches', activeMatchId),
      (snap) => {
        if (!snap.exists()) {
          setOnlineMatch(null);
          return;
        }
        const data = snap.data() as OnlineMatchDoc;
        setOnlineMatch(data);

        // If the current user is Player 1 or Player 2 and the match transitions to 'playing', auto-open Stage!
        const isParticipant =
          data.player1Id === currentUser.uid || data.player2Id === currentUser.uid;
        if (isParticipant && (data.status === 'playing' || data.status === 'finished')) {
          setGameMode('ONLINE_FIREBASE');
          setView('STAGE');
        }

        // Trigger sound effects and delayed reveal animations on online state transitions
        const prev = prevOnlineRoundRef.current;
        if (
          prev.roundPhase !== data.roundPhase ||
          prev.roundNumber !== data.roundNumber
        ) {
          prevOnlineRoundRef.current = {
            roundNumber: data.roundNumber,
            roundPhase: data.roundPhase,
          };

          if (data.roundPhase === 'HIDING') {
            setSelectedHideHat(null);
            setRevealActualCoinHat(false);
            sound.playBlanketClose();
          } else if (data.roundPhase === 'GUESSING') {
            sound.playBlanketOpen();
          } else if (data.roundPhase === 'REVEAL' || data.roundPhase === 'MATCH_OVER') {
            sound.playHatLift();
            const found = data.coinHat === data.guessedHat;
            if (found) {
              scheduleTimer(() => sound.playGuessCorrect(), 160);
            } else {
              scheduleTimer(() => {
                setRevealActualCoinHat(true);
                sound.playGuessMiss();
              }, 420);
            }
            if (data.roundPhase === 'MATCH_OVER') {
              scheduleTimer(() => sound.playMatchVictory(), 1100);
            }

            // Record in local session log
            setRoundHistory((prevLog) => {
              if (prevLog.some((r) => r.roundNumber === data.roundNumber)) return prevLog;
              const hIdx: 0 | 1 = data.hiderSlot === 1 ? 0 : 1;
              const sIdx: 0 | 1 = hIdx === 0 ? 1 : 0;
              const winIdx: 0 | 1 = found ? sIdx : hIdx;
              return [
                {
                  roundNumber: data.roundNumber,
                  hiderIndex: hIdx,
                  seekerIndex: sIdx,
                  coinHat: data.coinHat,
                  guessedHat: data.guessedHat,
                  seekerFoundCoin: found,
                  pointWinnerIndex: winIdx,
                },
                ...prevLog,
              ];
            });
          }
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );

    return () => unsub();
  }, [authLoading, currentUser, activeMatchId, scheduleTimer]);

  // Helper: Ensure user is signed in before performing an online Firebase lobby action
  const ensureSignedInUser = async (): Promise<User | null> => {
    if (currentUser) return currentUser;
    try {
      setLobbyError(null);
      const cred = await signInWithGoogle();
      return cred.user;
    } catch (err) {
      setLobbyError(
        err instanceof Error ? err.message : 'Sign-in was cancelled or blocked by popup settings.'
      );
      return null;
    }
  };

  // Create a fresh waiting match document and point the current table slot to it
  const createFreshMatchForSlot = async (
    user: User,
    slotId: string,
    initialSeat?: 1 | 2
  ): Promise<string> => {
    const newMatchId = generateUniqueMatchId(slotId);
    const matchPath = `matches/${newMatchId}`;
    const nickname = sanitizePlayerName(
      user.displayName || user.email?.split('@')[0],
      'Player'
    );

    const newMatchPayload = {
      matchId: newMatchId,
      hostId: user.uid,
      status: 'waiting' as const,
      player1Id: initialSeat === 1 ? user.uid : '',
      player1Name: initialSeat === 1 ? nickname : '',
      player2Id: initialSeat === 2 ? user.uid : '',
      player2Name: initialSeat === 2 ? nickname : '',
      score1: 0,
      score2: 0,
      roundNumber: 1,
      hiderSlot: 1 as const,
      roundPhase: 'HIDING' as const,
      coinHat: -1,
      guessedHat: -1,
      lastRoundWinnerSlot: 0 as const,
      winnerSlot: 0 as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'matches', newMatchId), newMatchPayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, matchPath);
    }

    if (PUBLIC_SLOTS.some((s) => s.slotId === slotId)) {
      const slotPath = `lobbySlots/${slotId}`;
      try {
        await setDoc(doc(db, 'lobbySlots', slotId), {
          slotId,
          activeMatchId: newMatchId,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, slotPath);
      }
    }

    setActiveMatchId(newMatchId);
    return newMatchId;
  };

  // Claim 1st Player or 2nd Player Seat in the Firebase Lobby
  const handlePickSeat = async (seat: 1 | 2) => {
    setLobbyError(null);
    const user = await ensureSignedInUser();
    if (!user) return;

    setBusyAction(`seat-${seat}`);
    try {
      const nickname = sanitizePlayerName(
        user.displayName || user.email?.split('@')[0],
        'Player'
      );

      // If there is no active match on this table yet, or the match is already finished/playing with others, create a fresh waiting match with this seat claimed
      if (
        !onlineMatch ||
        onlineMatch.status === 'finished' ||
        (onlineMatch.status === 'playing' &&
          onlineMatch.player1Id !== user.uid &&
          onlineMatch.player2Id !== user.uid)
      ) {
        await createFreshMatchForSlot(user, selectedSlotId, seat);
        sound.playCoinClink();
        return;
      }

      // Otherwise update the existing waiting match to claim `seat` (and release the other seat if held by the same user)
      const matchPath = `matches/${onlineMatch.matchId}`;
      const nextP1Id =
        seat === 1
          ? user.uid
          : onlineMatch.player1Id === user.uid
          ? ''
          : onlineMatch.player1Id;
      const nextP1Name =
        seat === 1
          ? nickname
          : onlineMatch.player1Id === user.uid
          ? ''
          : onlineMatch.player1Name;

      const nextP2Id =
        seat === 2
          ? user.uid
          : onlineMatch.player2Id === user.uid
          ? ''
          : onlineMatch.player2Id;
      const nextP2Name =
        seat === 2
          ? nickname
          : onlineMatch.player2Id === user.uid
          ? ''
          : onlineMatch.player2Name;

      try {
        await updateDoc(doc(db, 'matches', onlineMatch.matchId), {
          player1Id: nextP1Id,
          player1Name: nextP1Name,
          player2Id: nextP2Id,
          player2Name: nextP2Name,
          updatedAt: serverTimestamp(),
        });
        sound.playCoinClink();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, matchPath);
      }
    } finally {
      setBusyAction(null);
    }
  };

  // Leave claimed seat in the waiting lobby
  const handleLeaveSeat = async () => {
    if (!currentUser || !onlineMatch || onlineMatch.status !== 'waiting') return;
    setBusyAction('leave-seat');
    const matchPath = `matches/${onlineMatch.matchId}`;
    try {
      const isP1 = onlineMatch.player1Id === currentUser.uid;
      const isP2 = onlineMatch.player2Id === currentUser.uid;
      if (!isP1 && !isP2) return;

      await updateDoc(doc(db, 'matches', onlineMatch.matchId), {
        player1Id: isP1 ? '' : onlineMatch.player1Id,
        player1Name: isP1 ? '' : onlineMatch.player1Name,
        player2Id: isP2 ? '' : onlineMatch.player2Id,
        player2Name: isP2 ? '' : onlineMatch.player2Name,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, matchPath);
    } finally {
      setBusyAction(null);
    }
  };

  // Create a fresh table lobby when requested
  const handleCreateFreshTableLobby = async () => {
    setLobbyError(null);
    const user = await ensureSignedInUser();
    if (!user) return;
    setBusyAction('create-fresh');
    try {
      await createFreshMatchForSlot(user, selectedSlotId);
      setRoundHistory([]);
      sound.playBlanketClose();
    } finally {
      setBusyAction(null);
    }
  };

  // Join by custom Match ID code
  const handleJoinByMatchCode = async (rawCode: string) => {
    setLobbyError(null);
    const user = await ensureSignedInUser();
    if (!user) return;
    const cleanId = sanitizeMatchId(rawCode);
    const matchPath = `matches/${cleanId}`;
    setBusyAction('join-code');
    try {
      const snap = await getDoc(doc(db, 'matches', cleanId));
      if (!snap.exists()) {
        setLobbyError(`No match found with ID "${cleanId}". Check the code or create a new table.`);
        return;
      }
      setActiveMatchId(cleanId);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, matchPath);
    } finally {
      setBusyAction(null);
    }
  };

  // Start the online match once both 1st Player and 2nd Player seats are claimed
  const handleStartOnlineMatch = async () => {
    if (!currentUser || !onlineMatch) return;
    if (!onlineMatch.player1Id || !onlineMatch.player2Id) return;
    setBusyAction('start-match');
    const matchPath = `matches/${onlineMatch.matchId}`;
    try {
      await updateDoc(doc(db, 'matches', onlineMatch.matchId), {
        status: 'playing',
        roundPhase: 'HIDING',
        updatedAt: serverTimestamp(),
      });
      setRoundHistory([]);
      setGameMode('ONLINE_FIREBASE');
      setView('STAGE');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, matchPath);
    } finally {
      setBusyAction(null);
    }
  };

  // Start 1 Player Only (Middle Button in Lobby)
  const handleStartSinglePlayer = () => {
    clearAllTimers();
    setGameMode('VS_CPU');
    const myName = sanitizePlayerName(
      currentUser?.displayName || currentUser?.email?.split('@')[0],
      'Player 1'
    );
    setPlayerNames([myName, 'Parlor Bot']);
    setScores([0, 0]);
    setRoundNumber(1);
    setHiderIndex(0);
    setSelectedHideHat(null);
    setCoinHat(null);
    setGuessedHat(null);
    setRevealActualCoinHat(false);
    setRoundHistory([]);
    sound.playBlanketClose();
    setPhase('BLANKET_CLOSED_HIDING');
    setView('STAGE');
  };

  // Start Local 2-Player Pass & Play
  const handleStartLocalPassAndPlay = () => {
    clearAllTimers();
    setGameMode('PASS_AND_PLAY');
    setPlayerNames(['Player 1', 'Player 2']);
    setScores([0, 0]);
    setRoundNumber(1);
    setHiderIndex(0);
    setSelectedHideHat(null);
    setCoinHat(null);
    setGuessedHat(null);
    setRevealActualCoinHat(false);
    setRoundHistory([]);
    sound.playBlanketClose();
    setPhase(privacyStepEnabled ? 'BLANKET_CLOSED_PRIVACY' : 'BLANKET_CLOSED_HIDING');
    setView('STAGE');
  };

  // Online Firebase Gameplay Actions:
  // 1. Online Hider locks coin under Hat 0, 1, or 2 and opens the blanket
  const handleOnlineHideCoinAndOpenBlanket = async (hatIdx: number) => {
    if (!currentUser || !onlineMatch || onlineMatch.status !== 'playing') return;
    const matchPath = `matches/${onlineMatch.matchId}`;
    try {
      await updateDoc(doc(db, 'matches', onlineMatch.matchId), {
        coinHat: hatIdx,
        roundPhase: 'GUESSING',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, matchPath);
    }
  };

  // 2. Online Seeker guesses Hat 0, 1, or 2
  const handleOnlineSeekerGuess = async (chosenHatIdx: number) => {
    if (!currentUser || !onlineMatch || onlineMatch.status !== 'playing') return;
    if (onlineMatch.roundPhase !== 'GUESSING') return;

    const seekerSlot: 1 | 2 = onlineMatch.hiderSlot === 1 ? 2 : 1;
    const isMyGuessTurn =
      (seekerSlot === 1 && onlineMatch.player1Id === currentUser.uid) ||
      (seekerSlot === 2 && onlineMatch.player2Id === currentUser.uid);
    if (!isMyGuessTurn) return;

    const foundCoin = chosenHatIdx === onlineMatch.coinHat;
    const pointWinnerSlot: 1 | 2 = foundCoin ? seekerSlot : onlineMatch.hiderSlot;
    const nextScore1 = onlineMatch.score1 + (pointWinnerSlot === 1 ? 1 : 0);
    const nextScore2 = onlineMatch.score2 + (pointWinnerSlot === 2 ? 1 : 0);
    const reachedFive = nextScore1 >= WINNING_SCORE || nextScore2 >= WINNING_SCORE;

    const matchPath = `matches/${onlineMatch.matchId}`;
    try {
      await updateDoc(doc(db, 'matches', onlineMatch.matchId), {
        guessedHat: chosenHatIdx,
        score1: nextScore1,
        score2: nextScore2,
        lastRoundWinnerSlot: pointWinnerSlot,
        winnerSlot: reachedFive ? pointWinnerSlot : 0,
        roundPhase: reachedFive ? 'MATCH_OVER' : 'REVEAL',
        status: reachedFive ? 'finished' : 'playing',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, matchPath);
    }
  };

  // 3. Online Next Round (Swap Hider & Seeker Roles)
  const handleOnlineNextRound = async () => {
    if (!currentUser || !onlineMatch || onlineMatch.status !== 'playing') return;
    if (onlineMatch.roundPhase !== 'REVEAL') return;

    const nextHiderSlot: 1 | 2 = onlineMatch.hiderSlot === 1 ? 2 : 1;
    const matchPath = `matches/${onlineMatch.matchId}`;
    try {
      await updateDoc(doc(db, 'matches', onlineMatch.matchId), {
        roundNumber: onlineMatch.roundNumber + 1,
        hiderSlot: nextHiderSlot,
        roundPhase: 'HIDING',
        coinHat: -1,
        guessedHat: -1,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, matchPath);
    }
  };

  // Local / Solo Mode Handlers (1 Player vs Bot & 2-Player Local Pass & Play)
  const seekerIndex: 0 | 1 = hiderIndex === 0 ? 1 : 0;

  const lockLocalCoinAndOpenBlanket = useCallback(
    (hatIdx: number) => {
      clearAllTimers();
      setSelectedHideHat(hatIdx);
      setCoinHat(hatIdx);
      setGuessedHat(null);
      setRevealActualCoinHat(false);
      sound.playBlanketOpen();
      setPhase('BLANKET_OPEN_GUESSING');

      if (gameMode === 'VS_CPU' && hiderIndex === 0) {
        scheduleTimer(() => {
          const cpuChoice = Math.floor(Math.random() * 3);
          handleLocalSeekerGuess(cpuChoice, hatIdx);
        }, 1150);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearAllTimers, gameMode, hiderIndex, scheduleTimer]
  );

  const handleSelectHatToHide = (hatIdx: number) => {
    if (gameMode === 'ONLINE_FIREBASE') {
      sound.playCoinClink();
      setSelectedHideHat(hatIdx);
      if (instantOpenBlanket) {
        handleOnlineHideCoinAndOpenBlanket(hatIdx);
      }
      return;
    }

    if (phase !== 'BLANKET_CLOSED_HIDING' && phase !== 'BLANKET_CLOSED_PRIVACY') return;
    sound.playCoinClink();
    setSelectedHideHat(hatIdx);

    if (instantOpenBlanket || phase === 'BLANKET_CLOSED_PRIVACY') {
      lockLocalCoinAndOpenBlanket(hatIdx);
    }
  };

  const handleLocalSeekerGuess = (chosenHatIdx: number, overrideCoinHat?: number) => {
    const activeCoinHat = overrideCoinHat !== undefined ? overrideCoinHat : coinHat;
    if (activeCoinHat === null) return;

    clearAllTimers();
    setGuessedHat(chosenHatIdx);
    setHoveredHat(null);
    sound.playHatLift();
    setPhase('ROUND_REVEAL');

    const foundCoin = chosenHatIdx === activeCoinHat;
    const winnerIdx: 0 | 1 = foundCoin ? seekerIndex : hiderIndex;

    if (foundCoin) {
      scheduleTimer(() => sound.playGuessCorrect(), 160);
    } else {
      scheduleTimer(() => {
        setRevealActualCoinHat(true);
        sound.playGuessMiss();
      }, 420);
    }

    const nextScores: [number, number] = [...scores] as [number, number];
    nextScores[winnerIdx] += 1;
    setScores(nextScores);

    const record: RoundRecord = {
      roundNumber,
      hiderIndex,
      seekerIndex,
      coinHat: activeCoinHat,
      guessedHat: chosenHatIdx,
      seekerFoundCoin: foundCoin,
      pointWinnerIndex: winnerIdx,
    };
    setRoundHistory((prev) => [record, ...prev]);

    if (nextScores[winnerIdx] >= WINNING_SCORE) {
      scheduleTimer(() => {
        sound.playMatchVictory();
        setPhase('MATCH_OVER');
      }, 1500);
    }
  };

  const handleLocalNextRound = () => {
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
      setPhase('CPU_HIDING_BEHIND_BLANKET');
      scheduleTimer(() => sound.playCoinClink(), 500);
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

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.enabled = next;
  };

  // Compute unified display state for Stage View (works for both ONLINE_FIREBASE and local modes)
  const isOnlineStage = gameMode === 'ONLINE_FIREBASE' && onlineMatch !== null;
  const displayNames: [string, string] = isOnlineStage
    ? [onlineMatch.player1Name || '1st Player', onlineMatch.player2Name || '2nd Player']
    : playerNames;
  const displayScores: [number, number] = isOnlineStage
    ? [onlineMatch.score1, onlineMatch.score2]
    : scores;
  const displayRoundNumber = isOnlineStage ? onlineMatch.roundNumber : roundNumber;
  const displayHiderIndex: 0 | 1 = isOnlineStage
    ? onlineMatch.hiderSlot === 1
      ? 0
      : 1
    : hiderIndex;
  const displaySeekerIndex: 0 | 1 = displayHiderIndex === 0 ? 1 : 0;

  // Determine effective phase on Stage
  const isOnlineMyTurnToHide =
    isOnlineStage &&
    currentUser !== null &&
    ((onlineMatch.hiderSlot === 1 && onlineMatch.player1Id === currentUser.uid) ||
      (onlineMatch.hiderSlot === 2 && onlineMatch.player2Id === currentUser.uid));

  const isOnlineMyTurnToGuess =
    isOnlineStage &&
    currentUser !== null &&
    ((onlineMatch.hiderSlot === 1 && onlineMatch.player2Id === currentUser.uid) ||
      (onlineMatch.hiderSlot === 2 && onlineMatch.player1Id === currentUser.uid));

  let effectivePhase: RoundPhase = phase;
  if (isOnlineStage) {
    if (onlineMatch.roundPhase === 'HIDING') {
      effectivePhase = isOnlineMyTurnToHide
        ? 'BLANKET_CLOSED_HIDING'
        : 'CPU_HIDING_BEHIND_BLANKET';
    } else if (onlineMatch.roundPhase === 'GUESSING') {
      effectivePhase = 'BLANKET_OPEN_GUESSING';
    } else if (onlineMatch.roundPhase === 'REVEAL') {
      effectivePhase = 'ROUND_REVEAL';
    } else if (onlineMatch.roundPhase === 'MATCH_OVER' || onlineMatch.status === 'finished') {
      effectivePhase = 'MATCH_OVER';
    }
  }

  const effectiveCoinHat = isOnlineStage
    ? onlineMatch.coinHat >= 0
      ? onlineMatch.coinHat
      : null
    : coinHat;
  const effectiveGuessedHat = isOnlineStage
    ? onlineMatch.guessedHat >= 0
      ? onlineMatch.guessedHat
      : null
    : guessedHat;

  const hiderName = displayNames[displayHiderIndex];
  const seekerName = displayNames[displaySeekerIndex];
  const isBlanketClosed =
    effectivePhase === 'BLANKET_CLOSED_PRIVACY' ||
    effectivePhase === 'BLANKET_CLOSED_HIDING' ||
    effectivePhase === 'CPU_HIDING_BEHIND_BLANKET';
  const isOpaqueBlanket =
    effectivePhase === 'BLANKET_CLOSED_PRIVACY' ||
    effectivePhase === 'CPU_HIDING_BEHIND_BLANKET';

  const isWaitingForOpponentGuess =
    (gameMode === 'VS_CPU' &&
      displaySeekerIndex === 1 &&
      effectivePhase === 'BLANKET_OPEN_GUESSING') ||
    (isOnlineStage &&
      !isOnlineMyTurnToGuess &&
      effectivePhase === 'BLANKET_OPEN_GUESSING');

  const matchWinnerIndex: 0 | 1 | null =
    displayScores[0] >= WINNING_SCORE ? 0 : displayScores[1] >= WINNING_SCORE ? 1 : null;

  const tableSummaries: TableSlotSummary[] = PUBLIC_SLOTS.map((s) => {
    const mId = slotPointers[s.slotId] || null;
    return {
      slotId: s.slotId,
      label: s.label,
      activeMatchId: mId,
      match: mId ? slotMatches[mId] || null : null,
    };
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#0E1713] text-[#F4F1EA]">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-white/10 bg-[#0A110E]/90 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#lobby"
          onClick={(e) => {
            e.preventDefault();
            setView('LOBBY');
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
            onClick={() => {
              setView('LOBBY');
              setActiveDrawer('NONE');
            }}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              view === 'LOBBY' && activeDrawer === 'NONE' ? 'text-amber-200 underline' : ''
            }`}
          >
            Match Lobby
          </button>
          <button
            type="button"
            onClick={() => {
              setView('STAGE');
              setActiveDrawer('NONE');
            }}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              view === 'STAGE' && activeDrawer === 'NONE' ? 'text-amber-200 underline' : ''
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
            onClick={() => setView(view === 'LOBBY' ? 'STAGE' : 'LOBBY')}
            className="px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {view === 'LOBBY' ? 'Open Stage' : 'Match Lobby'}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6">
        {/* Collapsible Rules or Round History Panel */}
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
                <p className="font-semibold text-amber-300 mb-1">01. Match Lobby &amp; Seats</p>
                <p className="leading-relaxed">
                  Pick <strong>1st Player</strong> or <strong>2nd Player</strong> in the Firebase
                  Match Lobby to pair with a real online player, or choose the middle button for{' '}
                  <strong>1 Player Only</strong> against the Parlor Bot.
                </p>
              </div>
              <div>
                <p className="font-semibold text-amber-300 mb-1">02. Close Blanket &amp; Hide</p>
                <p className="leading-relaxed">
                  The velvet blanket closes across the stage. The Hider puts the gold coin under Hat
                  #1, Hat #2, or Hat #3, then opens the blanket.
                </p>
              </div>
              <div>
                <p className="font-semibold text-amber-300 mb-1">03. Guess the Hat</p>
                <p className="leading-relaxed">
                  When the blanket opens, the other player guesses which hat has the coin. If they
                  find it, they get <strong>+1 point</strong>; if they miss, the Hider gets{' '}
                  <strong>+1 point</strong>!
                </p>
              </div>
              <div>
                <p className="font-semibold text-amber-300 mb-1">04. Swap Turns to 5 Wins</p>
                <p className="leading-relaxed">
                  Players take turns hiding and finding the coin every round. The first player to
                  reach <strong>5 wins</strong> wins the game!
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
                No rounds completed in this session yet.
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
                    {roundHistory.map((item, idx) => (
                      <tr key={`${item.roundNumber}-${idx}`} className="text-stone-200">
                        <td className="py-2.5 pr-4 text-amber-300">#{item.roundNumber}</td>
                        <td className="py-2.5 pr-4 font-sans">{displayNames[item.hiderIndex]}</td>
                        <td className="py-2.5 pr-4 font-sans">
                          Hat #{item.coinHat + 1} ({HAT_META[item.coinHat]?.name})
                        </td>
                        <td className="py-2.5 pr-4 font-sans">
                          Hat #{item.guessedHat + 1} ({HAT_META[item.guessedHat]?.name})
                        </td>
                        <td className="py-2.5 font-sans font-semibold text-amber-300">
                          {displayNames[item.pointWinnerIndex]} (
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

        {/* VIEW 1: FIREBASE REAL-PLAYER MATCH LOBBY */}
        {view === 'LOBBY' ? (
          <MatchLobby
            currentUser={
              currentUser
                ? {
                    uid: currentUser.uid,
                    displayName: currentUser.displayName,
                    email: currentUser.email,
                  }
                : null
            }
            authLoading={authLoading}
            selectedSlotId={selectedSlotId}
            tableSummaries={tableSummaries}
            currentMatch={onlineMatch}
            busyAction={busyAction}
            errorMessage={lobbyError}
            onSignIn={ async () => {
              await ensureSignedInUser();
            }}
            onSignOut={async () => {
              await logOutUser();
              setOnlineMatch(null);
            }}
            onSelectTableSlot={(slotId) => {
              setSelectedSlotId(slotId);
              setLobbyError(null);
            }}
            onJoinByMatchCode={handleJoinByMatchCode}
            onPickSeat={handlePickSeat}
            onLeaveSeat={handleLeaveSeat}
            onCreateFreshTableLobby={handleCreateFreshTableLobby}
            onStartOnlineMatch={handleStartOnlineMatch}
            onStartSinglePlayer={handleStartSinglePlayer}
            onStartLocalPassAndPlay={handleStartLocalPassAndPlay}
          />
        ) : (
          /* VIEW 2: ACTIVE GAME STAGE (Supports Live Online Firebase, 1 Player vs Bot, and 2P Local) */
          <>
            {/* Top Scoreboard & Mode Switcher Strip */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* 1st Player Score Card */}
              <div
                className={`lg:col-span-4 rounded-xl p-4 border transition-colors flex flex-col justify-between ${
                  isBlanketClosed && displayHiderIndex === 0
                    ? 'bg-[#17261F] border-amber-400/60'
                    : effectivePhase === 'BLANKET_OPEN_GUESSING' && displaySeekerIndex === 0
                    ? 'bg-[#17261F] border-emerald-400/60'
                    : 'bg-[#131E18] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {editingNames && !isOnlineStage ? (
                      <input
                        type="text"
                        value={playerNames[0]}
                        onChange={(e) =>
                          setPlayerNames([sanitizePlayerName(e.target.value, 'Player 1'), playerNames[1]])
                        }
                        onBlur={() => setEditingNames(false)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingNames(false)}
                        className="bg-black/40 border border-amber-400/50 rounded px-2 py-0.5 text-sm font-semibold text-amber-100 w-36 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => !isOnlineStage && setEditingNames(true)}
                        className="text-base font-bold text-stone-100 hover:text-amber-200 truncate cursor-pointer"
                      >
                        1st: {displayNames[0]}
                      </button>
                    )}
                    <span className="text-xs text-stone-400 whitespace-nowrap">
                      · {displayHiderIndex === 0 ? 'Hiding Coin' : 'Guessing Hat'}
                    </span>
                  </div>
                  <div className="font-mono text-2xl font-bold text-amber-300 tabular-nums shrink-0">
                    {displayScores[0]}{' '}
                    <span className="text-xs font-normal text-stone-400">/ {WINNING_SCORE}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: WINNING_SCORE }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-2.5 w-7 rounded-sm transition-colors ${
                          i < displayScores[0]
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]'
                            : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-stone-400 font-mono tabular-nums whitespace-nowrap">
                    {WINNING_SCORE - displayScores[0] > 0
                      ? `${WINNING_SCORE - displayScores[0]} to win`
                      : 'WINNER'}
                  </span>
                </div>
              </div>

              {/* Center Match Status & Mode Bar */}
              <div className="lg:col-span-4 rounded-xl p-4 bg-[#131E18] border border-white/10 flex flex-col justify-between gap-3">
                <div className="flex items-center justify-center gap-2 text-xs text-stone-300 font-medium">
                  <span className="font-mono tabular-nums text-amber-300 font-semibold">
                    Round {displayRoundNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>First to {WINNING_SCORE} Wins</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {isOnlineStage
                      ? `Live Match (${onlineMatch.matchId})`
                      : gameMode === 'VS_CPU'
                      ? '1 Player vs Bot'
                      : '2P Pass & Play'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B120E] rounded-lg border border-white/5">
                  <button
                    type="button"
                    onClick={() => setView('LOBBY')}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isOnlineStage
                        ? 'bg-amber-400 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span>Online Lobby</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStartSinglePlayer}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      gameMode === 'VS_CPU'
                        ? 'bg-amber-400 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5 shrink-0" />
                    <span>1 Player Only</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStartLocalPassAndPlay}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      gameMode === 'PASS_AND_PLAY'
                        ? 'bg-amber-400 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span>2P Local</span>
                  </button>
                </div>
              </div>

              {/* 2nd Player Score Card */}
              <div
                className={`lg:col-span-4 rounded-xl p-4 border transition-colors flex flex-col justify-between ${
                  isBlanketClosed && displayHiderIndex === 1
                    ? 'bg-[#17261F] border-amber-400/60'
                    : effectivePhase === 'BLANKET_OPEN_GUESSING' && displaySeekerIndex === 1
                    ? 'bg-[#17261F] border-emerald-400/60'
                    : 'bg-[#131E18] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base font-bold text-stone-100 truncate">
                      2nd: {displayNames[1]}
                    </span>
                    <span className="text-xs text-stone-400 whitespace-nowrap">
                      · {displayHiderIndex === 1 ? 'Hiding Coin' : 'Guessing Hat'}
                    </span>
                  </div>
                  <div className="font-mono text-2xl font-bold text-amber-300 tabular-nums shrink-0">
                    {displayScores[1]}{' '}
                    <span className="text-xs font-normal text-stone-400">/ {WINNING_SCORE}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: WINNING_SCORE }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-2.5 w-7 rounded-sm transition-colors ${
                          i < displayScores[1]
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]'
                            : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-stone-400 font-mono tabular-nums whitespace-nowrap">
                    {WINNING_SCORE - displayScores[1] > 0
                      ? `${WINNING_SCORE - displayScores[1]} to win`
                      : 'WINNER'}
                  </span>
                </div>
              </div>
            </section>

            {/* THE GRAND PARLOR STAGE & VELVET BLANKET ARENA */}
            <section className="relative flex-1 min-h-[520px] rounded-2xl border-2 border-[#3E2723] shadow-[0_24px_60px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col justify-between felt-table-surface">
              {/* Top Stage Valance Bar */}
              <div className="relative z-30 flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 bg-[#1B110E]/95 border-b border-amber-500/25">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-300/90">
                    {isBlanketClosed ? 'Blanket Closed' : 'Blanket Open'}
                  </span>
                  <span aria-hidden="true" className="text-stone-600">
                    ·
                  </span>
                  <span className="text-sm font-medium text-stone-200">
                    {effectivePhase === 'BLANKET_CLOSED_PRIVACY' &&
                      `${hiderName} is ready to hide the coin (${seekerName}, look away!)`}
                    {effectivePhase === 'BLANKET_CLOSED_HIDING' &&
                      `Behind the Closed Blanket: ${hiderName}, choose a hat to hide the coin`}
                    {effectivePhase === 'CPU_HIDING_BEHIND_BLANKET' &&
                      `${hiderName} closed the blanket and is hiding the coin...`}
                    {effectivePhase === 'BLANKET_OPEN_GUESSING' &&
                      `Blanket Open! ${seekerName}, guess which hat hides ${hiderName}'s coin!`}
                    {effectivePhase === 'ROUND_REVEAL' &&
                      (effectiveCoinHat === effectiveGuessedHat
                        ? `${seekerName} found the coin! +1 Point to ${seekerName}`
                        : `${seekerName} missed! +1 Point to ${hiderName}`)}
                    {effectivePhase === 'MATCH_OVER' &&
                      matchWinnerIndex !== null &&
                      `${displayNames[matchWinnerIndex]} reached ${WINNING_SCORE} wins and wins the game!`}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-stone-300">
                  {gameMode === 'PASS_AND_PLAY' && (
                    <>
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
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setInstantOpenBlanket(!instantOpenBlanket)}
                    className="hover:text-amber-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Auto-Open Blanket on Click:{' '}
                    <strong className="text-amber-300">{instantOpenBlanket ? 'On' : 'Off'}</strong>
                  </button>
                </div>
              </div>

              {/* Translucent Backstage Cutaway Tint when Hider is peeking behind the closed blanket */}
              {effectivePhase === 'BLANKET_CLOSED_HIDING' && (
                <div
                  className="absolute inset-0 pointer-events-none z-10 velvet-blanket-backstage border-x-[18px] border-[#6E1220]/70"
                  aria-hidden="true"
                />
              )}

              {/* Left & Right Stage Blanket Curtains */}
              <div
                className="absolute inset-y-0 left-0 w-1/2 z-20 velvet-blanket-surface border-r-2 border-amber-400/50 shadow-[12px_0_36px_rgba(0,0,0,0.85)] transition-transform duration-300 ease-out pointer-events-none"
                style={{
                  transform: isOpaqueBlanket
                    ? 'translateX(0%)'
                    : effectivePhase === 'BLANKET_CLOSED_HIDING'
                    ? 'translateX(-88%)'
                    : 'translateX(-100%)',
                }}
                aria-hidden="true"
              >
                <div className="absolute bottom-0 inset-x-0 h-3 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-600 opacity-80" />
              </div>

              <div
                className="absolute inset-y-0 right-0 w-1/2 z-20 velvet-blanket-surface border-l-2 border-amber-400/50 shadow-[-12px_0_36px_rgba(0,0,0,0.85)] transition-transform duration-300 ease-out pointer-events-none"
                style={{
                  transform: isOpaqueBlanket
                    ? 'translateX(0%)'
                    : effectivePhase === 'BLANKET_CLOSED_HIDING'
                    ? 'translateX(88%)'
                    : 'translateX(100%)',
                }}
                aria-hidden="true"
              >
                <div className="absolute bottom-0 inset-x-0 h-3 bg-gradient-to-r from-amber-600 via-yellow-300 to-amber-500 opacity-80" />
              </div>

              {/* OPAQUE BLANKET OVERLAY (When opponent is hiding the coin behind the closed blanket) */}
              {isOpaqueBlanket && (
                <div className="absolute inset-0 z-25 flex flex-col items-center justify-center p-6 text-center">
                  <div className="max-w-lg w-full rounded-2xl bg-[#1A080C]/95 border border-amber-400/40 p-8 shadow-2xl">
                    {effectivePhase === 'BLANKET_CLOSED_PRIVACY' ? (
                      <>
                        <p className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-2">
                          Round {displayRoundNumber} · Blanket Closed
                        </p>
                        <h2
                          className="font-display text-2xl sm:text-3xl font-bold text-amber-100 mb-3"
                          style={{ textWrap: 'balance' }}
                        >
                          {seekerName}, Look Away! {hiderName} Needs to Hide the Coin.
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            sound.playHatLift();
                            setPhase('BLANKET_CLOSED_HIDING');
                          }}
                          className="mt-4 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                          Round {displayRoundNumber} · Blanket Closed
                        </p>
                        <h2
                          className="font-display text-2xl sm:text-3xl font-bold text-amber-100 mb-2"
                          style={{ textWrap: 'balance' }}
                        >
                          {hiderName} is Hiding the Gold Coin Behind the Closed Blanket...
                        </h2>
                        <p className="text-sm text-stone-300">
                          The blanket will open as soon as {hiderName} hides the coin under one of
                          the 3 hats!
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* STAGE INSTRUCTION BANNER */}
              <div className="relative z-15 pt-6 px-6 text-center">
                {effectivePhase === 'BLANKET_CLOSED_HIDING' && (
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
                      Click Hat #1, Hat #2, or Hat #3 below to hide the coin, then open the blanket
                      for {seekerName} to guess!
                    </p>
                  </div>
                )}

                {effectivePhase === 'BLANKET_OPEN_GUESSING' && (
                  <div className="max-w-2xl mx-auto">
                    <p className="text-xs font-mono uppercase tracking-widest text-emerald-300 mb-1">
                      Step 2 of 2 · Blanket Open!
                    </p>
                    <h1
                      className="font-display text-2xl sm:text-3xl font-bold text-white"
                      style={{ textWrap: 'balance' }}
                    >
                      {isWaitingForOpponentGuess
                        ? `Waiting for ${seekerName} to Guess a Hat...`
                        : `${seekerName}, Guess Which Hat Has the Hidden Coin!`}
                    </h1>
                    <p className="text-sm text-stone-300 mt-1">
                      {isWaitingForOpponentGuess
                        ? `You hid the coin under Hat #${(effectiveCoinHat ?? 0) + 1}. Let's see if ${seekerName} finds it or misses!`
                        : `Click one of the 3 hats below to lift it. Find the coin for +1 point—or if you miss, ${hiderName} gets +1 point!`}
                    </p>
                  </div>
                )}

                {effectivePhase === 'ROUND_REVEAL' && (
                  <div className="max-w-2xl mx-auto">
                    <p className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-1">
                      Round {displayRoundNumber} Result
                    </p>
                    <h1
                      className="font-display text-2xl sm:text-3xl font-bold text-white"
                      style={{ textWrap: 'balance' }}
                    >
                      {effectiveCoinHat === effectiveGuessedHat
                        ? `${seekerName} Found the Coin Under Hat #${(effectiveCoinHat ?? 0) + 1}!`
                        : `${seekerName} Missed! Coin Was Hidden Under Hat #${
                            (effectiveCoinHat ?? 0) + 1
                          }!`}
                    </h1>
                    <p className="text-sm text-amber-200 font-medium mt-1">
                      +1 Point awarded to{' '}
                      <strong>
                        {effectiveCoinHat === effectiveGuessedHat ? seekerName : hiderName}
                      </strong>{' '}
                      · Next turn: {seekerName} will hide the coin!
                    </p>
                  </div>
                )}
              </div>

              {/* THE 3 HATS ON THE STAGE TABLE */}
              <div className="relative z-15 my-auto py-8 px-4 sm:px-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10 max-w-4xl mx-auto items-end">
                  {HAT_META.map((hat) => {
                    const idx = hat.id;

                    const isHiderPreviewingThisHat =
                      effectivePhase === 'BLANKET_CLOSED_HIDING' && selectedHideHat === idx;
                    const isGuessedHatInReveal =
                      (effectivePhase === 'ROUND_REVEAL' || effectivePhase === 'MATCH_OVER') &&
                      effectiveGuessedHat === idx;
                    const isActualCoinHatRevealedOnMiss =
                      (effectivePhase === 'ROUND_REVEAL' || effectivePhase === 'MATCH_OVER') &&
                      (revealActualCoinHat || effectiveCoinHat === effectiveGuessedHat) &&
                      effectiveCoinHat === idx;

                    const isHatLifted =
                      isHiderPreviewingThisHat ||
                      isGuessedHatInReveal ||
                      isActualCoinHatRevealedOnMiss;

                    const showCoinUnderHat =
                      (effectivePhase === 'BLANKET_CLOSED_HIDING' && selectedHideHat === idx) ||
                      ((effectivePhase === 'ROUND_REVEAL' || effectivePhase === 'MATCH_OVER') &&
                        effectiveCoinHat === idx &&
                        isHatLifted);

                    const isInteractive =
                      effectivePhase === 'BLANKET_CLOSED_HIDING' ||
                      (effectivePhase === 'BLANKET_OPEN_GUESSING' && !isWaitingForOpponentGuess);

                    return (
                      <div key={hat.id} className="flex flex-col items-center">
                        <button
                          type="button"
                          disabled={!isInteractive}
                          onClick={() => {
                            if (effectivePhase === 'BLANKET_CLOSED_HIDING') {
                              handleSelectHatToHide(idx);
                            } else if (
                              effectivePhase === 'BLANKET_OPEN_GUESSING' &&
                              !isWaitingForOpponentGuess
                            ) {
                              if (isOnlineStage) {
                                handleOnlineSeekerGuess(idx);
                              } else {
                                handleLocalSeekerGuess(idx);
                              }
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
                              ? effectiveGuessedHat === effectiveCoinHat
                                ? 'bg-emerald-500/15 border border-emerald-400/60'
                                : 'bg-rose-500/15 border border-rose-400/50'
                              : 'bg-black/15 hover:bg-black/25 border border-white/10'
                          }`}
                        >
                          <div className="relative w-full h-36 flex items-end justify-center">
                            <div
                              className="absolute bottom-2 w-40 h-7 rounded-full bg-black/65 blur-[2px] transition-transform duration-200"
                              style={{
                                transform: isHatLifted ? 'scale(0.78)' : 'scale(1)',
                              }}
                              aria-hidden="true"
                            />

                            <div className="absolute bottom-3 z-10 flex flex-col items-center justify-center">
                              {showCoinUnderHat ? (
                                <div className="flex flex-col items-center animate-bounce">
                                  <GoldCoinIllustration size={58} glowing />
                                </div>
                              ) : isGuessedHatInReveal &&
                                effectiveGuessedHat !== effectiveCoinHat ? (
                                <div className="flex items-center gap-1 text-xs font-mono font-bold text-rose-300 bg-rose-950/90 border border-rose-400/40 px-2.5 py-1 rounded">
                                  <X className="w-3.5 h-3.5" />
                                  <span>Empty Hat!</span>
                                </div>
                              ) : null}
                            </div>

                            <div className="relative z-20 w-48">
                              <ParlorHatIllustration
                                hatIndex={idx}
                                isLifted={isHatLifted}
                                isSelected={
                                  isHiderPreviewingThisHat ||
                                  (effectivePhase === 'ROUND_REVEAL' &&
                                    (effectiveGuessedHat === idx || effectiveCoinHat === idx))
                                }
                                isHovered={hoveredHat === idx}
                              />
                            </div>
                          </div>

                          <div className="mt-2 text-center">
                            <div className="text-sm font-bold text-stone-100 group-hover:text-amber-200 transition-colors">
                              Hat #{idx + 1} · {hat.name}
                            </div>
                            <div className="text-xs text-stone-400 mt-0.5">
                              {effectivePhase === 'BLANKET_CLOSED_HIDING' &&
                                (selectedHideHat === idx ? (
                                  <span className="text-amber-300 font-semibold">
                                    Coin Placed Here (Key {hat.shortcut})
                                  </span>
                                ) : (
                                  <span>Click to Put Coin Here (Key {hat.shortcut})</span>
                                ))}
                              {effectivePhase === 'BLANKET_OPEN_GUESSING' &&
                                (isWaitingForOpponentGuess ? (
                                  <span>
                                    {isOnlineStage && isOnlineMyTurnToHide && effectiveCoinHat === idx
                                      ? 'Your Coin is Hidden Here'
                                      : `Waiting for ${seekerName}...`}
                                  </span>
                                ) : (
                                  <span className="text-emerald-300 group-hover:underline">
                                    Click to Guess Hat #{idx + 1} (Key {hat.shortcut})
                                  </span>
                                ))}
                              {(effectivePhase === 'ROUND_REVEAL' ||
                                effectivePhase === 'MATCH_OVER') && (
                                <span>
                                  {effectiveCoinHat === idx && effectiveGuessedHat === idx && (
                                    <span className="text-emerald-300 font-semibold">
                                      Guessed &amp; Found Coin!
                                    </span>
                                  )}
                                  {effectiveCoinHat === idx && effectiveGuessedHat !== idx && (
                                    <span className="text-amber-300 font-semibold">
                                      Coin Was Hidden Here!
                                    </span>
                                  )}
                                  {effectiveCoinHat !== idx && effectiveGuessedHat === idx && (
                                    <span className="text-rose-300 font-semibold">
                                      Guessed (Missed)
                                    </span>
                                  )}
                                  {effectiveCoinHat !== idx && effectiveGuessedHat !== idx && (
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

              {/* BOTTOM STAGE CONTROL DECK */}
              <div className="relative z-25 px-6 py-4 bg-[#140D0B]/95 border-t border-amber-500/25 flex flex-wrap items-center justify-between gap-4">
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

                <div className="flex items-center gap-3">
                  {effectivePhase === 'BLANKET_CLOSED_HIDING' && (
                    <button
                      type="button"
                      disabled={selectedHideHat === null}
                      onClick={() => {
                        if (selectedHideHat === null) return;
                        if (isOnlineStage) {
                          handleOnlineHideCoinAndOpenBlanket(selectedHideHat);
                        } else {
                          lockLocalCoinAndOpenBlanket(selectedHideHat);
                        }
                      }}
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

                  {effectivePhase === 'ROUND_REVEAL' && matchWinnerIndex === null && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isOnlineStage) {
                          handleOnlineNextRound();
                        } else {
                          handleLocalNextRound();
                        }
                      }}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm shadow-[0_0_20px_rgba(251,191,36,0.4)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Next Turn: Close Blanket ({seekerName} Hides Coin Next)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  {matchWinnerIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isOnlineStage) {
                          setView('LOBBY');
                        } else if (gameMode === 'VS_CPU') {
                          handleStartSinglePlayer();
                        } else {
                          handleStartLocalPassAndPlay();
                        }
                      }}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{isOnlineStage ? 'Return to Match Lobby' : 'Play Again'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* VICTORY MODAL OVERLAY WHEN A PLAYER REACHES 5 WINS */}
              {effectivePhase === 'MATCH_OVER' && matchWinnerIndex !== null && (
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
                      {displayNames[matchWinnerIndex]} Wins the Game!
                    </h2>
                    <p className="text-sm text-stone-300 mb-6">
                      <strong className="text-amber-200">{displayNames[matchWinnerIndex]}</strong>{' '}
                      reached {WINNING_SCORE} points first!
                    </p>

                    <div className="rounded-xl bg-black/35 border border-white/10 p-4 mb-6 flex items-center justify-around font-mono tabular-nums">
                      <div>
                        <div className="text-xs font-sans text-stone-400">{displayNames[0]}</div>
                        <div className="text-2xl font-bold text-amber-300">
                          {displayScores[0]} pts
                        </div>
                      </div>
                      <div className="h-8 w-px bg-white/10" />
                      <div>
                        <div className="text-xs font-sans text-stone-400">{displayNames[1]}</div>
                        <div className="text-2xl font-bold text-amber-300">
                          {displayScores[1]} pts
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isOnlineStage) {
                            setView('LOBBY');
                            handleCreateFreshTableLobby();
                          } else if (gameMode === 'VS_CPU') {
                            handleStartSinglePlayer();
                          } else {
                            handleStartLocalPassAndPlay();
                          }
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>
                          {isOnlineStage ? 'Start New Online Lobby Table' : 'Play Again'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setView('LOBBY')}
                        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-stone-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>Back to Match Lobby</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* Quiet Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-4 pt-2 pb-4 text-xs text-stone-400 border-t border-white/5">
          <div>
            Three Hats &amp; A Coin · First to 5 Wins · Live Firebase Matchmaking &amp; Solo Mode
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
