import type { BaileysEventEmitter, LIDMapping } from '../Types'
import { isLidUser, isPnUser, jidNormalizedUser } from '../WABinary'

export const toLidPnMapping = (lid: string | null | undefined, pn: string | null | undefined) => {
	if (!lid || !pn || !isLidUser(lid) || !isPnUser(pn)) {
		return undefined
	}

	return { lid: jidNormalizedUser(lid), pn: jidNormalizedUser(pn) } satisfies LIDMapping
}

export const getLidPnMappingFromAlt = (primaryJid: string, altJid: string) =>
	toLidPnMapping(altJid, primaryJid) || toLidPnMapping(primaryJid, altJid)

export const emitLidPnMappings = (ev: BaileysEventEmitter, mappings: LIDMapping[]) => {
	const emitted = new Set<string>()
	for (const mapping of mappings) {
		const validMapping = toLidPnMapping(mapping.lid, mapping.pn)
		if (!validMapping) {
			continue
		}

		const key = `${validMapping.lid}\u0000${validMapping.pn}`
		if (emitted.has(key)) {
			continue
		}

		emitted.add(key)
		ev.emit('lid-mapping.update', validMapping)
	}
}
