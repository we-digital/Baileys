import type { BinaryNode } from '../WABinary'
import { isJidStatusBroadcast } from '../WABinary'

/**
 * Builds an ACK stanza for a received node.
 * Pure function -- no I/O, no side effects.
 *
 * Mirrors WhatsApp Web's ACK construction:
 * - WAWebHandleMsgSendAck.sendAck / sendNack
 * - WAWebCreateNackFromStanza.createNackFromStanza
 */
export function buildAckStanza(node: BinaryNode, errorCode?: number, meId?: string): BinaryNode {
	const { tag, attrs } = node
	const stanza: BinaryNode = {
		tag: 'ack',
		attrs: {
			id: attrs.id!,
			to: attrs.from!,
			class: tag
		}
	}

	if (errorCode) {
		stanza.attrs.error = errorCode.toString()
	}

	if (attrs.participant) {
		stanza.attrs.participant = attrs.participant
	}

	if (attrs.recipient) {
		stanza.attrs.recipient = attrs.recipient
	}

	// WA Web always includes type when present: `n.type || DROP_ATTR`
	if (attrs.type) {
		stanza.attrs.type = attrs.type
	}

	// WA Web WAWebHandleMsgSendAck.sendAck/sendNack always include `from` for message-class ACKs
	if (tag === 'message' && meId) {
		stanza.attrs.from = meId
	}

	return stanza
}

/**
 * Error code for the ACK of a stanza dropped by `shouldIgnoreJid`.
 *
 * Ignored `message` stanzas are NACKed (500) so the server may retry them later.
 * Status (story) messages are the exception: WhatsApp redelivers a NACKed
 * `status@broadcast` message and, after ~50 minutes without a positive ACK,
 * closes the stream with `<stream:error><ack class="status" .../></stream:error>`.
 * Every linked device that ignores statuses then reconnects on the same cadence.
 * A plain ACK tells the server the status reached this device and stops the loop.
 */
export function ignoredStanzaAckError(type: string, from: string | undefined, nackCode: number): number | undefined {
	if (type !== 'message') {
		return undefined
	}

	if (from && isJidStatusBroadcast(from)) {
		return undefined
	}

	return nackCode
}
