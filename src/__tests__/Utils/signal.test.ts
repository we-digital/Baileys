import { jest } from '@jest/globals'
/* @ts-ignore */
import * as libsignal from 'libsignal'
import { installLibSignalSessionLogRedaction } from '../../Signal/libsignal'
import type { SignalRepositoryWithLIDStore } from '../../Types'
import { parseAndInjectE2ESessions } from '../../Utils/signal'
import type { BinaryNode } from '../../WABinary/types'

describe('parseAndInjectE2ESessions', () => {
	it('should process all user node', async () => {
		const mockRepository = {
			injectE2ESession: jest.fn<SignalRepositoryWithLIDStore['injectE2ESession']>()
		} as jest.Mocked<Pick<SignalRepositoryWithLIDStore, 'injectE2ESession'>>

		mockRepository.injectE2ESession.mockResolvedValue(undefined)

		const createUserNode = (jid: string): BinaryNode => ({
			tag: 'user',
			attrs: { jid },
			content: [
				{
					tag: 'skey',
					attrs: {},
					content: [
						{ tag: 'id', attrs: {}, content: Buffer.from([0, 0, 1]) },
						{ tag: 'value', attrs: {}, content: Buffer.alloc(33) },
						{ tag: 'signature', attrs: {}, content: Buffer.alloc(64) }
					]
				},
				{
					tag: 'key',
					attrs: {},
					content: [
						{ tag: 'id', attrs: {}, content: Buffer.from([0, 0, 2]) },
						{ tag: 'value', attrs: {}, content: Buffer.alloc(33) }
					]
				},
				{ tag: 'identity', attrs: {}, content: Buffer.alloc(32) },
				{ tag: 'registration', attrs: {}, content: Buffer.alloc(4) }
			]
		})

		const mockNode: BinaryNode = {
			tag: 'iq',
			attrs: {},
			content: [
				{
					tag: 'list',
					attrs: {},
					content: [
						createUserNode('user1@s.whatsapp.net'),
						createUserNode('user2@s.whatsapp.net'),
						createUserNode('user3@s.whatsapp.net')
					]
				}
			]
		}

		await parseAndInjectE2ESessions(mockNode, mockRepository as any)

		expect(mockRepository.injectE2ESession).toHaveBeenCalledTimes(3)
		expect(mockRepository.injectE2ESession).toHaveBeenCalledWith(
			expect.objectContaining({ jid: 'user1@s.whatsapp.net' })
		)
		expect(mockRepository.injectE2ESession).toHaveBeenCalledWith(
			expect.objectContaining({ jid: 'user2@s.whatsapp.net' })
		)
		expect(mockRepository.injectE2ESession).toHaveBeenCalledWith(
			expect.objectContaining({ jid: 'user3@s.whatsapp.net' })
		)
	})
})

describe('installLibSignalSessionLogRedaction', () => {
	it('preserves session state transitions without logging key material', () => {
		type SessionEntry = { indexInfo: { closed: number } }
		type SessionRecord = {
			closeSession(session: SessionEntry): void
			openSession(session: SessionEntry): void
		}
		type SessionRecordConstructor = {
			new (): SessionRecord
			createEntry(): SessionEntry
		}

		installLibSignalSessionLogRedaction()
		const info = jest.spyOn(console, 'info').mockImplementation(() => undefined)
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		const SessionRecord = libsignal.SessionRecord as unknown as SessionRecordConstructor
		const record = new SessionRecord()
		const session = SessionRecord.createEntry()
		session.indexInfo = { closed: -1 }

		record.closeSession(session)
		expect(session.indexInfo.closed).toBeGreaterThan(0)
		record.openSession(session)
		expect(session.indexInfo.closed).toBe(-1)
		expect(info).not.toHaveBeenCalled()
		expect(warn).not.toHaveBeenCalled()

		info.mockRestore()
		warn.mockRestore()
	})
})
