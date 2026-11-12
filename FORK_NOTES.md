# we:Digital Baileys compatibility fork

This branch is a narrow production compatibility fork of upstream tag `v7.0.0-rc14`
(previously `wdgtl-v7.0.0-rc.9.4` on top of `v7.0.0-rc.9`).
It exists to prevent group messages from remaining at `Waiting for this message`
after a participant changes phones, Signal identity, PN/LID mapping, or device list.

## What upstream rc14 already covers

- Identity-change handling lives in `src/Utils/identity-change-handler.ts`:
  per-JID debounce, companion-device skip, self-primary skip, no-session skip,
  offline-notification skip, and an `onBeforeSessionRefresh` hook that reissues
  tctokens before the forced session refresh (`reason=identity`).
- `lid-mapping.update` is emitted for app-state `contactAction` and
  `pnForLidChatAction` mutations and for linked-profile notifications.
  History sync returns `lidPnMappings` in `messaging-history.set` and stores them.
- `libsignal` moved to the npm package `libsignal@6.0.0`.

## Local behavior (still ours)

- Identity change is still routed through upstream `handleIdentityChange`; its
  skips (debounce, companion, self, offline, no session) and tctoken reissue are kept.
  The `assertSessions` passed to it is widened: it resolves both PN and LID aliases,
  bypasses the user-device cache, enumerates the devices again through USync and
  force-refreshes every device session (`reason=identity`), not only the notifying JID.
- After `session_refreshed`, `session_refresh_failed`, `skipped_offline` or
  `skipped_no_session`, matching `sender-key-memory` entries are removed from every
  participating group, so each group redistributes its own Sender Key Distribution
  Message on its next send. Upstream still does not do this.
- The identity scan reads participating group IDs with
  `groupFetchAllParticipating(false)`, which does not emit `groups.update`; this
  prevents consumers from issuing a metadata request for every group and hitting
  WhatsApp rate limits during reconnect. The group ID list is shared for 60 seconds
  so offline identity-change bursts cost one query.
- The socket emits an `identity-change` event with the handler `action` and recovery
  counters for operations.
- `repairGroupSenderKeyDistribution(groupJid)` performs an explicit full repair:
  fresh group metadata, uncached USync device enumeration, forced pairwise session
  refresh, and reset of the target group's sender-key delivery memory.
- Group sends carry a `phash` attribute, like whatsmeow: sha256 over the sorted
  `user.0:device@server` addresses of every participant device, our own sending device
  included and hosted devices excluded, first 6 bytes, unpadded base64 (`2:` + 8 chars).
  Upstream sent no group phash and cut the base64 string to 6 chars, so the server
  answered every group ack with its own phash and the recovery below ran on every send.
  Checked on 2026-11-12 against a live group: the computed value equals the server's,
  and with it on the stanza the ack comes back without `phash`.
- An ack `phash` that differs from the hash we sent triggers at most one full repair and
  resend per message during a 10-minute window. Upstream still has this resend commented
  out; the bound prevents the loop it warns about. An ack `phash` for a message without a
  recorded hash (sent before a restart) only repairs, so the next send redistributes the
  sender key; missed devices recover through retry receipts.
- The group fan-out skips our exact sending device, as the 1:1 path already did
  (`extractDeviceJids` compares the full `me.lid` JID with a bare user, so it never
  filtered our own LID device). The device still counts in the `phash`.
- libsignal 6.0.0 still dumps whole SessionEntry objects (key material) via
  `console.info`/`console.warn` in `openSession`, `closeSession` and
  `removeOldSessions`. Baileys replaces those three methods with the same state
  transitions without logging.
- Newly learned PN/LID pairs are emitted as `lid-mapping.update` right after they are
  stored from history sync, LID migration sync, and message alt JIDs (upstream stores
  these silently). Emitted JIDs are user-level (device suffix stripped). LID migration
  sync skips entries whose LID or PN is missing or `0` instead of storing `0@lid`.
- The two Signal LRU caches (`LIDMappingStore.mappingCache`, `migratedSessionCache`)
  are bounded (`max: 10000`) and run without `ttlAutopurge` timers. Both hold data
  derived from persistent keys, so eviction is only a cache miss. Until rc.9.4 this was
  a hash-checked postinstall patch in `wdgtl-evo-api`; it now lives here.
- A failed participant-hash repair is logged and no longer swallows the error-ack
  `messages.update` (status ERROR) that consumers forward to Chatwoot.
- `whatsapp-rust-bridge` is pinned to 0.5.5: 0.5.4 exports only the ESM `import`
  condition, so CommonJS consumers such as `wdgtl-evo-api` fail at `require` time.

## Verification

Run before changing or rebasing this branch:

```sh
corepack yarn install --immutable
corepack yarn test
corepack yarn build
corepack yarn lint
```

The integration acceptance test must use a group with an affected primary mobile
device and a linked device. Re-register or change the primary phone identity, send a
new text and a document, and confirm both devices can decrypt both messages.
Repeat once with the identity change arriving while the socket is offline.

## Upstream tracking and removal

- Root-cause report: https://github.com/WhiskeySockets/Baileys/issues/2704
- Related upstream candidate: https://github.com/WhiskeySockets/Baileys/pull/2711

Do not replace this pinned fork merely because a newer release exists. First identify
the exact upstream commits covering sender-key-memory invalidation on identity change,
PN/LID aliases, uncached device refresh of all alias devices, and bounded
participant-hash recovery. Then run the acceptance test against that candidate.

The production consumer is `we-digital/wdgtl-evo-api`. It pins an immutable release
asset plus lockfile integrity from this fork so branch movement cannot silently alter
a production build.
