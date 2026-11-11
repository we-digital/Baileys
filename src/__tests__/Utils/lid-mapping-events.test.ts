import { jest } from '@jest/globals'
import { proto } from '../../../WAProto/index.js'
import type {
	AuthenticationCreds,
	BaileysEventEmitter,
	SignalKeyStoreWithTransaction,
	SignalRepositoryWithLIDStore,
	WAMessage
} from '../../Types'
import { processSyncAction } from '../../Utils/chat-utils'
import { processHistoryMessage } from '../../Utils/history'
import { emitLidPnMappings, getLidPnMappingFromAlt, toLidPnMapping } from '../../Utils/lid-mapping-events'
import processMessage from '../../Utils/process-message'

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

		expect(result.lidPnMappings).toContainEqual({ lid: '111@lid', pn: '628123@s.whatsapp.net' })
	})

	it('strips device suffixes from emitted mappings', () => {
		expect(getLidPnMappingFromAlt('628123:3@s.whatsapp.net', '111:3@lid')).toEqual({
			lid: '111@lid',
			pn: '628123@s.whatsapp.net'
		})
	})

	it('stores and emits LID migration sync mappings, skipping incomplete pairs', async () => {
		const emit = jest.fn()
		const storeLIDPNMappings = jest.fn(async () => {})
		const migrateSession = jest.fn(async () => ({ migrated: 0, skipped: 0, total: 0 }))
		const encodedMappingPayload = proto.LIDMigrationMappingSyncPayload.encode({
			pnToLidMappings: [
				{ pn: 628123, assignedLid: 111 },
				{ pn: 628456, latestLid: 222, assignedLid: 333 },
				{ pn: 628789 }
			]
		}).finish()
		const message: WAMessage = {
			key: { remoteJid: 'me@s.whatsapp.net', fromMe: true, id: 'LIDSYNC' },
			message: {
				protocolMessage: {
					type: proto.Message.ProtocolMessage.Type.LID_MIGRATION_MAPPING_SYNC,
					lidMigrationMappingSyncMessage: { encodedMappingPayload }
				}
			}
		}

		await processMessage(message, {
			shouldProcessHistoryMsg: false,
			ev: { emit } as unknown as BaileysEventEmitter,
			creds: { me: { id: 'me@s.whatsapp.net' } } as unknown as AuthenticationCreds,
			keyStore: {} as unknown as SignalKeyStoreWithTransaction,
			options: {},
			getMessage: async () => undefined,
			signalRepository: {
				lidMapping: { storeLIDPNMappings },
				migrateSession
			} as unknown as SignalRepositoryWithLIDStore
		})

		const expected = [
			{ lid: '111@lid', pn: '628123@s.whatsapp.net' },
			{ lid: '222@lid', pn: '628456@s.whatsapp.net' }
		]
		expect(storeLIDPNMappings).toHaveBeenCalledWith(expected)
		expect(emit).toHaveBeenCalledWith('lid-mapping.update', expected[0])
		expect(emit).toHaveBeenCalledWith('lid-mapping.update', expected[1])
		expect(migrateSession).toHaveBeenCalledTimes(2)
	})

	it('emits a mapping from app-state contact actions', () => {
		const emit = jest.fn()
		processSyncAction(
			{
				syncAction: {
					value: { contactAction: { fullName: 'Contact', lidJid: '111@lid' } }
				},
				index: ['contact', '628123@s.whatsapp.net']
			} as unknown as Parameters<typeof processSyncAction>[0],
			{ emit } as unknown as BaileysEventEmitter,
			{ id: 'me@s.whatsapp.net' }
		)

		expect(emit).toHaveBeenCalledWith('lid-mapping.update', {
			lid: '111@lid',
			pn: '628123@s.whatsapp.net'
		})
	})
})
