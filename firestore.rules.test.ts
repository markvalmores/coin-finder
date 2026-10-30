/**
 * Security Rules Verification Suite (Dirty Dozen Payloads)
 * Verifies that all 12 adversarial payloads in security_spec.md are rejected with PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'create' | 'update' | 'get' | 'list';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Match Create',
    collection: 'matches',
    docId: 'match-1',
    operation: 'create',
    auth: { uid: 'uid_attacker', email_verified: true },
    payload: {
      matchId: 'match-1',
      hostId: 'uid_victim', // Spoofed hostId != request.auth.uid
      status: 'waiting',
      player1Id: 'uid_attacker',
      player1Name: 'Attacker',
      player2Id: '',
      player2Name: '',
      score1: 0,
      score2: 0,
      roundNumber: 1,
      hiderSlot: 1,
      roundPhase: 'HIDING',
      coinHat: -1,
      guessedHat: -1,
      lastRoundWinnerSlot: 0,
      winnerSlot: 0,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Seat Hijacking on Occupied Player 1 Slot',
    collection: 'matches',
    docId: 'match-1',
    operation: 'update',
    auth: { uid: 'uid_attacker', email_verified: true },
    payload: {
      player1Id: 'uid_attacker', // Existing player1Id is 'uid_host'
      player1Name: 'Hijacker',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow / Ghost Field Injection',
    collection: 'matches',
    docId: 'match-1',
    operation: 'update',
    auth: { uid: 'uid_host', email_verified: true },
    payload: {
      coinHat: 1,
      roundPhase: 'GUESSING',
      isVerifiedAdmin: true, // Ghost field not in schema
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Terminal State Mutation on Finished Match',
    collection: 'matches',
    docId: 'match-finished',
    operation: 'update',
    auth: { uid: 'uid_host', email_verified: true },
    payload: {
      status: 'playing',
      score1: 0,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Value Poisoning on Score (> 5)',
    collection: 'matches',
    docId: 'match-1',
    operation: 'update',
    auth: { uid: 'uid_host', email_verified: true },
    payload: {
      score1: 999,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Resource Exhaustion Oversized Player Name',
    collection: 'matches',
    docId: 'match-1',
    operation: 'create',
    auth: { uid: 'uid_attacker', email_verified: true },
    payload: {
      matchId: 'match-1',
      hostId: 'uid_attacker',
      player1Name: 'A'.repeat(5000), // Exceeds 60 char limit
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Path ID Mismatch / Poisoning',
    collection: 'matches',
    docId: 'match-1',
    operation: 'create',
    auth: { uid: 'uid_attacker', email_verified: true },
    payload: {
      matchId: 'different-match-id',
      hostId: 'uid_attacker',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Unverified Email Spoof Attack',
    collection: 'matches',
    docId: 'match-1',
    operation: 'create',
    auth: { uid: 'uid_unverified', email_verified: false },
    payload: {
      matchId: 'match-1',
      hostId: 'uid_unverified',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Timestamp Forgery (updatedAt != request.time)',
    collection: 'matches',
    docId: 'match-1',
    operation: 'update',
    auth: { uid: 'uid_host', email_verified: true },
    payload: {
      coinHat: 2,
      updatedAt: '2099-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immortal Field Tampering (mutating hostId or createdAt)',
    collection: 'matches',
    docId: 'match-1',
    operation: 'update',
    auth: { uid: 'uid_player2', email_verified: true },
    payload: {
      hostId: 'uid_player2',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Orphaned LobbySlot Pointer to Non-Existent Match',
    collection: 'lobbySlots',
    docId: 'slot-1',
    operation: 'create',
    auth: { uid: 'uid_attacker', email_verified: true },
    payload: {
      slotId: 'slot-1',
      activeMatchId: 'non-existent-match-id',
      updatedBy: 'uid_attacker',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Out-of-Turn Spectator Mutation During Active Match',
    collection: 'matches',
    docId: 'match-1',
    operation: 'update',
    auth: { uid: 'uid_spectator', email_verified: true },
    payload: {
      guessedHat: 0,
      roundPhase: 'REVEAL',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
