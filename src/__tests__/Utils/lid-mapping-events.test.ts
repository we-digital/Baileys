import { jest } from '@jest/globals'
import { proto } from '../../../WAProto/index.js'
import type { BaileysEventEmitter } from '../../Types'
import { processSyncAction } from '../../Utils/chat-utils'
import { processHistoryMessage } from '../../Utils/history'
import { emitLidPnMappings, getLidPnMappingFromAlt, toLidPnMapping } from '../../Utils/lid-mapping-events'

describe('LID mapping events', () => {
	it('normalizes either PN/LID alt direction', () => {
		expect(getLidPnMappingFromAlt('628123@s.whatsapp.net', '111@lid')).toEqual({
			lid: '111@lid',
			pn: '628123@s.whatsapp.net'
		})
		expect(getLidPnMappingFromAlt('111@lid', '628123@s.whatsapp.net')).toEqual({
			lid: '111@lid',
			pn: '628123@s.whatsapp.net'
		})
	})

	it('rejects invalid pairs', () => {
		expect(toLidPnMapping('111@lid', '222@lid')).toBeUndefined()
		expect(toLidPnMapping('628123@s.whatsapp.net', '111@lid')).toBeUndefined()
	})

	it('emits each valid mapping once', () => {
		const emit = jest.fn()
		emitLidPnMappings({ emit } as unknown as BaileysEventEmitter, [
			{ lid: '111@lid', pn: '628123@s.whatsapp.net' },
			{ lid: '111@lid', pn: '628123@s.whatsapp.net' },
			{ lid: 'bad@s.whatsapp.net', pn: '628123@s.whatsapp.net' }
		])

		expect(emit).toHaveBeenCalledTimes(1)
		expect(emit).toHaveBeenCalledWith('lid-mapping.update', {
			lid: '111@lid',
			pn: '628123@s.whatsapp.net'
		})
	})

	it('extracts mappings from history sync payloads', () => {
		const result = processHistoryMessage({
			syncType: proto.HistorySync.HistorySyncType.PUSH_NAME,
			pushnames: [],
			phoneNumberToLidMappings: [
				{ lidJid: '111@lid', pnJid: '628123@s.whatsapp.net' },
				{ lidJid: 'bad@s.whatsapp.net', pnJid: '628456@s.whatsapp.net' }
			]
		})

		expect(result.lidPnMappings).toEqual([{ lid: '111@lid', pn: '628123@s.whatsapp.net' }])
	})

	it('emits a mapping from app-state contact actions', () => {
		const emit = jest.fn()
		processSyncAction(
			{
				syncAction: {
					value: { contactAction: { fullName: 'Contact', lidJid: '111@lid' } }
				},
				index: ['contact', '628123@s.whatsapp.net']
			} as any,
			{ emit } as unknown as BaileysEventEmitter,
			{ id: 'me@s.whatsapp.net' }
		)

		expect(emit).toHaveBeenCalledWith('lid-mapping.update', {
			lid: '111@lid',
			pn: '628123@s.whatsapp.net'
		})
	})
})
