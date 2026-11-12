import { generateParticipantHashV2 } from '../../Utils/generics'
import { groupParticipantHash, participantHashAckAction } from '../../Utils/participant-hash'

// Expected values computed independently, like whatsmeow participantListHashV2:
// base64.RawStdEncoding(sha256(sorted ADString joined)[:6])
describe('generateParticipantHashV2', () => {
	it('hashes ADString device addresses into the 8-character server format', () => {
		expect(generateParticipantHashV2(['333:50@lid', '111@lid', '222@lid', '111:3@lid'])).toBe('2:1TqeOgfX')
		expect(generateParticipantHashV2(['5522:7@s.whatsapp.net', '5511@s.whatsapp.net'])).toBe('2:y2Q8sZk0')
	})

	it('does not depend on input order and does not mutate the input', () => {
		const input = ['222@lid', '111:3@lid', '111@lid', '333:50@lid']
		const copy = [...input]
		expect(generateParticipantHashV2(input)).toBe('2:1TqeOgfX')
		expect(input).toEqual(copy)
	})
})

describe('groupParticipantHash', () => {
	it('includes our sending device once and drops hosted devices', () => {
		const fanout = ['111@lid', '111:3@lid', '222@lid', '444:99@hosted.lid']
		expect(groupParticipantHash(fanout, '333:50@lid')).toBe('2:1TqeOgfX')
		expect(groupParticipantHash([...fanout, '333:50@lid'], '333:50@lid')).toBe('2:1TqeOgfX')
	})
})

describe('participantHashAckAction', () => {
	it('does nothing when the server hash matches the one we sent', () => {
		expect(participantHashAckAction('2:1TqeOgfX', '2:1TqeOgfX')).toBe('none')
	})

	it('repairs and resends on a real mismatch', () => {
		expect(participantHashAckAction('2:1TqeOgfX', '2:awXhy0UA')).toBe('repair-and-resend')
	})

	it('only repairs when no hash was recorded for the message', () => {
		expect(participantHashAckAction(undefined, '2:awXhy0UA')).toBe('repair')
	})
})
