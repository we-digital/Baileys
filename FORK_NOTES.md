# we:Digital Baileys compatibility fork

This branch is a narrow production compatibility fork of upstream tag `v7.0.0-rc.9`.
It exists to prevent group messages from remaining at `Waiting for this message`
after a participant changes phones, Signal identity, PN/LID mapping, or device list.

## Local behavior

- An `encrypt` identity-change notification resolves both PN and LID aliases.
- The user-device cache is bypassed and the affected device sessions are fetched
  again with `reason=identity`.
- Matching `sender-key-memory` entries are removed from every participating group,
  so each group redistributes its own Sender Key Distribution Message on its next send.
- The identity scan reads participating group IDs without emitting `groups.update`;
  this prevents consumers from issuing a metadata request for every group and hitting
  WhatsApp rate limits during reconnect.
- The socket emits an `identity-change` event with recovery counters for operations.
- `repairGroupSenderKeyDistribution(groupJid)` performs an explicit full repair:
  fresh group metadata, uncached USync device enumeration, forced pairwise session
  refresh, and reset of the target group's sender-key delivery memory.
- A server `phash` mismatch triggers at most one full repair and resend per message
  during a 10-minute window. The bound prevents the retry loop warned about in the
  upstream stub.
- Baileys replaces libsignal-node's session open/close logger with the same state
  transitions without dumping SessionEntry objects and their key material.
- Newly learned PN/LID pairs are emitted immediately after they are stored from
  history sync, migration sync, message alt JIDs, or app-state contact actions.
  Consumers can reconcile provisional identities without waiting for a daily scan.

## Verification

Run before changing or rebasing this branch:

```sh
corepack yarn install --immutable
corepack yarn test --runInBand
corepack yarn build
corepack yarn lint
```

The integration acceptance test must use a group with an affected primary mobile
device and a linked device. Re-register or change the primary phone identity, send a
new text and a document, and confirm both devices can decrypt both messages.

## Upstream tracking and removal

- Root-cause report: https://github.com/WhiskeySockets/Baileys/issues/2704
- Related upstream candidate: https://github.com/WhiskeySockets/Baileys/pull/2711

Do not replace this pinned fork merely because a newer release exists. First identify
the exact upstream commits covering identity-change invalidation, PN/LID aliases,
uncached device refresh, forced session recreation, and bounded participant-hash
recovery. Then run the acceptance test against that candidate.

The production consumer is `we-digital/wdgtl-evo-api`. It pins an immutable release
asset plus lockfile integrity from this fork so branch movement cannot silently alter
a production build.
