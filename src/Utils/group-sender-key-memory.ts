import type { SignalDataTypeMap, SignalKeyStore } from '../Types'
import { jidNormalizedUser } from '../WABinary'

export type GroupSenderKeyInvalidationResult = {
	groupsChecked: number
	groupsUpdated: number
	deviceEntriesRemoved: number
}

/**
 * Remove stale per-device sender-key delivery markers for an identity from all
 * known groups. The next send to each affected group will include a fresh SKDM.
 */
export const invalidateGroupSenderKeyMemoryForIdentities = async (
	keys: SignalKeyStore,
	groupJids: string[],
	identityJids: string[]
): Promise<GroupSenderKeyInvalidationResult> => {
	const normalizedIdentities = new Set(identityJids.filter(Boolean).map(jidNormalizedUser))
	const uniqueGroupJids = [...new Set(groupJids.filter(Boolean))]

	if (!uniqueGroupJids.length || !normalizedIdentities.size) {
		return { groupsChecked: uniqueGroupJids.length, groupsUpdated: 0, deviceEntriesRemoved: 0 }
	}

	const storedMemory = await keys.get('sender-key-memory', uniqueGroupJids)
	const updates: Record<string, SignalDataTypeMap['sender-key-memory']> = {}
	let deviceEntriesRemoved = 0

	for (const groupJid of uniqueGroupJids) {
		const senderKeyMemory = storedMemory[groupJid]
		if (!senderKeyMemory) {
			continue
		}

		const nextMemory = { ...senderKeyMemory }
		let groupChanged = false

		for (const deviceJid of Object.keys(nextMemory)) {
			if (normalizedIdentities.has(jidNormalizedUser(deviceJid))) {
				delete nextMemory[deviceJid]
				deviceEntriesRemoved += 1
				groupChanged = true
			}
		}

		if (groupChanged) {
			updates[groupJid] = nextMemory
		}
	}

	if (Object.keys(updates).length) {
		await keys.set({ 'sender-key-memory': updates })
	}

	return {
		groupsChecked: uniqueGroupJids.length,
		groupsUpdated: Object.keys(updates).length,
		deviceEntriesRemoved
	}
}
