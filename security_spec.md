# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Authentication & Verification Gate**: Every read or write to `/lobbySlots/{slotId}` and `/matches/{matchId}` requires `request.auth != null` and `request.auth.token.email_verified == true`.
2. **No Collection Listing (`allow list: if false`)**: Neither `/lobbySlots` nor `/matches` permits `list` queries. All matchmaking and game synchronization uses direct document lookups (`get`) on known slot IDs (`slot-1`..`slot-4`) and match IDs.
3. **Strict Key & Type Blueprint (`isValidLobbySlot` & `isValidMatch`)**: Every `create` and `update` must pass full schema validation (`hasAll` + `hasOnly`, string `.size()` bounds, regex patterns, integer bounds, and enum checks).
4. **Path ID Hardening (`isValidId`)**: Both `{slotId}` and `{matchId}` must match `^[a-zA-Z0-9_\-]+$` with `.size() <= 128`, and must equal the document's internal `slotId` / `matchId` field.
5. **Identity Integrity**:
   - On `/matches/{matchId}` creation, `hostId == request.auth.uid`, and the creator must occupy either `player1Id` or `player2Id` (or neither if creating an open table) while never spoofing another user's UID.
   - When claiming 1st Player or 2nd Player seat in the lobby, a user can only write their own `request.auth.uid` into an empty seat (or clear their own seat).
   - On `/lobbySlots/{slotId}`, `updatedBy == request.auth.uid` and `exists(/databases/$(database)/documents/matches/$(incoming().activeMatchId))` must hold.
6. **Terminal State Locking**: Once a `/matches/{matchId}` document reaches `status == 'finished'`, zero subsequent updates are permitted (`existing().status != 'finished'`).
7. **Immutable Fields**: `matchId`, `hostId`, and `createdAt` on `/matches/{matchId}` are strictly immutable across all updates. `slotId` on `/lobbySlots/{slotId}` is strictly immutable.
8. **Temporal Integrity**: `createdAt == request.time` on `create`, and `updatedAt == request.time` on `create` and `update`.

---

## 2. The "Dirty Dozen" Payloads (Designed to Break Identity, Integrity & State)

1. **Payload 1 (Identity Spoofing on Match Create)**: Authenticated user `uid_attacker` creates `/matches/match-1` with `hostId: "uid_victim"`. -> `PERMISSION_DENIED`
2. **Payload 2 (Seat Hijacking on Lobby Join)**: User `uid_attacker` attempts to overwrite an already occupied `player1Id: "uid_host"` with `"uid_attacker"`. -> `PERMISSION_DENIED`
3. **Payload 3 (Shadow / Ghost Field Injection)**: User sends a valid match update plus `"isAdmin": true` or `"hackedScore": 99`. -> `PERMISSION_DENIED`
4. **Payload 4 (Terminal State Mutation)**: User attempts to update `score1` or `status` on a match where `existing().status == "finished"`. -> `PERMISSION_DENIED`
5. **Payload 5 (Value Poisoning on Score)**: User updates `score1` to `999` or `"five"` (exceeding the `0..5` bound or wrong type). -> `PERMISSION_DENIED`
6. **Payload 6 (Resource Exhaustion / 1MB String)**: User injects a 5,000-character `player1Name` string (`maxLength` is `60`). -> `PERMISSION_DENIED`
7. **Payload 7 (Path ID Poisoning)**: User creates `/matches/bad$id!@#` or mismatches path `{matchId}` with `data.matchId`. -> `PERMISSION_DENIED`
8. **Payload 8 (Unverified Email Spoof)**: User with `email_verified: false` attempts to create or join a match. -> `PERMISSION_DENIED`
9. **Payload 9 (Timestamp Forgery)**: User supplies a past or future client timestamp for `updatedAt` instead of `request.time`. -> `PERMISSION_DENIED`
10. **Payload 10 (Immortal Field Tampering)**: Participant attempts to mutate `hostId` or `createdAt` during an active match update. -> `PERMISSION_DENIED`
11. **Payload 11 (Orphaned LobbySlot Pointer)**: User updates `/lobbySlots/slot-1` with `activeMatchId: "non-existent-match-999"` where the target match document does not exist. -> `PERMISSION_DENIED`
12. **Payload 12 (Out-of-Turn Non-Participant Write)**: Authenticated third-party user `uid_spectator` (neither `player1Id` nor `player2Id`) attempts to update `coinHat`, `guessedHat`, or `roundPhase` during `"playing"`. -> `PERMISSION_DENIED`
