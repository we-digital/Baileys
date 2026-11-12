import { isHostedLidUser, isHostedPnUser } from '../WABinary'
import { generateParticipantHashV2 } from './generics'

/**
 * Devices the server hashes for a group send: every participant device, our own
 * sending device included, without hosted devices (whatsmeow `sendGroup`).
 */
export const groupParticipantHash = (deviceJids: string[], senderDeviceJid: string) => {
	const hashed = deviceJids.filter(jid => jid !== senderDeviceJid && !isHostedLidUser(jid) && !isHostedPnUser(jid))
	hashed.push(senderDeviceJid)
	return generateParticipantHashV2(hashed)
}

/**
 * What to do with the `phash` of a group message ack:
 * - `none`: it matches the hash we sent, every device got the message
 * - `repair-and-resend`: it differs, so some devices were missed
 * - `repair`: nothing recorded for this message (e.g. sent before a restart);
 *   reset sender keys for the next send and leave missed devices to retry receipts
 */
export const participantHashAckAction = (sentHash: string | undefined, serverHash: string) => {
	if (!sentHash) {
		return 'repair' as const
	}

	return sentHash === serverHash ? ('none' as const) : ('repair-and-resend' as const)
}
