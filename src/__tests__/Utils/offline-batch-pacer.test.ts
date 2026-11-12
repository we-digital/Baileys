import { jest } from '@jest/globals'
import { makeOfflineBatchPacer } from '../../Utils/offline-batch-pacer'

const logger = { level: 'silent', child: () => logger, trace() {}, debug() {}, info() {}, warn() {}, error() {} } as any

describe('makeOfflineBatchPacer', () => {
	let requests: number[]
	let wsOpen: boolean

	const make = (opts: { batchSize?: number; idleMs?: number; maxRequestsWithoutProgress?: number } = {}) =>
		makeOfflineBatchPacer({
			requestBatch: async count => {
				requests.push(count)
			},
			isWsOpen: () => wsOpen,
			logger,
			batchSize: 3,
			idleMs: 1000,
			...opts
		})

	const deliver = (pacer: ReturnType<typeof make>, n: number) => {
		for (let i = 0; i < n; i++) pacer.onReceived()
		for (let i = 0; i < n; i++) pacer.onHandled()
	}

	beforeEach(() => {
		jest.useFakeTimers()
		requests = []
		wsOpen = true
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('asks for the first batch on preview', () => {
		const pacer = make({ batchSize: 100 })
		pacer.start()
		expect(requests).toEqual([100])
	})

	it('asks for the next batch as soon as a full batch is handled', () => {
		const pacer = make()
		pacer.start()
		deliver(pacer, 3)
		expect(requests).toEqual([3, 3])
		deliver(pacer, 3)
		expect(requests).toEqual([3, 3, 3])
	})

	it('drains a backlog much larger than one batch on a single connection', () => {
		const pacer = make({ batchSize: 100 })
		let backlog = 1_000
		pacer.start()
		while (backlog > 0 && pacer.isActive) {
			const n = Math.min(100, backlog)
			backlog -= n
			deliver(pacer, n)
			if (backlog === 0) pacer.finish()
		}

		expect(backlog).toBe(0)
		// ten full batches, then one more request that the server answers with <ib><offline/>
		expect(requests).toHaveLength(11)
		expect(pacer.isActive).toBe(false)
	})

	it('waits until queued stanzas are handled before asking again', () => {
		const pacer = make()
		pacer.start()
		pacer.onReceived()
		pacer.onReceived()
		pacer.onReceived()
		pacer.onHandled()
		pacer.onHandled()
		expect(requests).toEqual([3])
		jest.advanceTimersByTime(5000)
		expect(requests).toEqual([3])
		pacer.onHandled()
		expect(requests).toEqual([3, 3])
	})

	it('asks again after an idle gap when the server sent fewer stanzas than we counted', () => {
		const pacer = make()
		pacer.start()
		deliver(pacer, 2)
		expect(requests).toEqual([3])
		jest.advanceTimersByTime(999)
		expect(requests).toEqual([3])
		jest.advanceTimersByTime(1)
		expect(requests).toEqual([3, 3])
	})

	it('a stanza arriving during the idle wait cancels the idle request', () => {
		const pacer = make()
		pacer.start()
		deliver(pacer, 1)
		jest.advanceTimersByTime(500)
		pacer.onReceived()
		jest.advanceTimersByTime(5000)
		expect(requests).toEqual([3])
		pacer.onHandled()
		jest.advanceTimersByTime(1000)
		expect(requests).toEqual([3, 3])
	})

	it('stops on <ib><offline/>', () => {
		const pacer = make()
		pacer.start()
		deliver(pacer, 1)
		pacer.finish()
		jest.advanceTimersByTime(10_000)
		deliver(pacer, 3)
		expect(requests).toEqual([3])
	})

	it('stops on close and never sends on a closed socket', () => {
		const pacer = make()
		pacer.start()
		pacer.stop()
		deliver(pacer, 3)
		jest.advanceTimersByTime(10_000)
		expect(requests).toEqual([3])

		pacer.start()
		wsOpen = false
		deliver(pacer, 3)
		jest.advanceTimersByTime(10_000)
		expect(requests).toEqual([3, 3])
	})

	it('gives up after a few requests that bring nothing', () => {
		const pacer = make({ maxRequestsWithoutProgress: 2 })
		pacer.start()
		jest.advanceTimersByTime(10_000)
		expect(requests).toEqual([3, 3, 3])
		expect(pacer.isActive).toBe(false)
	})

	it('progress resets the no-progress counter', () => {
		const pacer = make({ maxRequestsWithoutProgress: 1 })
		pacer.start()
		jest.advanceTimersByTime(1000)
		expect(requests).toEqual([3, 3])
		deliver(pacer, 1)
		jest.advanceTimersByTime(1000)
		expect(requests).toEqual([3, 3, 3])
		jest.advanceTimersByTime(1000)
		expect(requests).toEqual([3, 3, 3, 3])
		jest.advanceTimersByTime(1000)
		expect(requests).toEqual([3, 3, 3, 3])
		expect(pacer.isActive).toBe(false)
	})

	it('a new preview restarts the cycle', () => {
		const pacer = make()
		pacer.start()
		deliver(pacer, 1)
		pacer.start()
		expect(requests).toEqual([3, 3])
		deliver(pacer, 3)
		expect(requests).toEqual([3, 3, 3])
	})

	it('never asks again when the preview total fits in the first batch', () => {
		const pacer = make({ batchSize: 100 })
		pacer.start(40)
		deliver(pacer, 40)
		jest.advanceTimersByTime(60_000)
		expect(requests).toEqual([100])
	})

	it('keeps asking while fewer stanzas than the preview total have arrived', () => {
		const pacer = make()
		pacer.start(7)
		deliver(pacer, 3)
		deliver(pacer, 3)
		expect(requests).toEqual([3, 3, 3])
		deliver(pacer, 1)
		jest.advanceTimersByTime(60_000)
		expect(requests).toEqual([3, 3, 3])
	})
})
