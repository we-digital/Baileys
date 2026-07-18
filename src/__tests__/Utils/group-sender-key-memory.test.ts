import { jest } from '@jest/globals'
import type { SignalDataTypeMap, SignalKeyStore } from '../../Types'
import { invalidateGroupSenderKeyMemoryForIdentities } from '../../Utils/group-sender-key-memory'

describe('invalidateGroupSenderKeyMemoryForIdentities', () => {
	it('removes PN and LID device entries only for the changed identity', async () => {
		const set = jest.fn<SignalKeyStore['set']>()
		const senderKeyMemory = {
			'group-1@g.us': {
				'5511999999999:0@s.whatsapp.net': true,
				'5511999999999:4@s.whatsapp.net': true,
				'777777777777777:0@lid': true,
				'5511888888888:0@s.whatsapp.net': true
			},
			'group-2@g.us': {
				'777777777777777:2@lid': true,
				'5511777777777:0@s.whatsapp.net': true
			}
		}
		const get: SignalKeyStore['get'] = async <T extends keyof SignalDataTypeMap>() =>
			senderKeyMemory as unknown as Record<string, SignalDataTypeMap[T]>
		const keys: SignalKeyStore = {
			get,
			set
		}

		const result = await invalidateGroupSenderKeyMemoryForIdentities(
			keys,
			['group-1@g.us', 'group-2@g.us'],
			['5511999999999@s.whatsapp.net', '777777777777777@lid']
		)

		expect(result).toEqual({ groupsChecked: 2, groupsUpdated: 2, deviceEntriesRemoved: 4 })
		expect(set).toHaveBeenCalledWith({
			'sender-key-memory': {
				'group-1@g.us': { '5511888888888:0@s.whatsapp.net': true },
				'group-2@g.us': { '5511777777777:0@s.whatsapp.net': true }
			}
		})
	})

	it('does not write when no stored device entry matches', async () => {
		const set = jest.fn<SignalKeyStore['set']>()
		const senderKeyMemory = {
			'group-1@g.us': { '5511888888888:0@s.whatsapp.net': true }
		}
		const get: SignalKeyStore['get'] = async <T extends keyof SignalDataTypeMap>() =>
			senderKeyMemory as unknown as Record<string, SignalDataTypeMap[T]>
		const keys: SignalKeyStore = {
			get,
			set
		}

		const result = await invalidateGroupSenderKeyMemoryForIdentities(
			keys,
			['group-1@g.us'],
			['5511999999999@s.whatsapp.net']
		)

		expect(result).toEqual({ groupsChecked: 1, groupsUpdated: 0, deviceEntriesRemoved: 0 })
		expect(set).not.toHaveBeenCalled()
	})
})
