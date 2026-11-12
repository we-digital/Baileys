import type { ILogger } from './logger'

export type OfflineBatchPacerDeps = {
	/** sends `<ib><offline_batch count="N"/></ib>` */
	requestBatch: (count: number) => Promise<void>
	isWsOpen: () => boolean
	logger: ILogger
	batchSize?: number
	/** how long the queue must stay idle before the next batch is requested anyway */
	idleMs?: number
	/** idle requests in a row that brought nothing before the pacer gives up */
	maxRequestsWithoutProgress?: number
}

/**
 * Paces the delivery of offline stanzas.
 *
 * On `offline_preview` the server waits for the client to ask for offline stanzas
 * with `offline_batch`, and it sends at most that many per request. Until the whole
 * offline backlog is delivered (`<ib><offline/>`), it sends nothing live either.
 * Upstream asks once for 100 and never again, so a session with a larger backlog
 * gets 100 stanzas per connection and falls further behind every hour.
 *
 * The pacer asks for the next batch as soon as the previous one has been handled
 * (or the queue has gone idle, in case the server counted stanzas we did not see),
 * and stops at `<ib><offline/>`, on close, or after a few requests that brought nothing.
 */
export function makeOfflineBatchPacer({
	requestBatch,
	isWsOpen,
	logger,
	batchSize = 100,
	idleMs = 3_000,
	maxRequestsWithoutProgress = 3
}: OfflineBatchPacerDeps) {
	let active = false
	let receivedSinceRequest = 0
	let pending = 0
	let requests = 0
	let received = 0
	let requestsWithoutProgress = 0
	let expectedTotal: number | undefined
	let idleTimer: ReturnType<typeof setTimeout> | undefined

	const clearIdle = () => {
		if (idleTimer) {
			clearTimeout(idleTimer)
			idleTimer = undefined
		}
	}

	const stop = () => {
		active = false
		clearIdle()
	}

	const request = () => {
		clearIdle()
		if (!active || !isWsOpen()) {
			return
		}

		// the preview said how many stanzas wait; once they are all here only <ib><offline/> is left
		if (requests > 0 && expectedTotal !== undefined && received >= expectedTotal) {
			return
		}

		if (receivedSinceRequest === 0 && requests > 0) {
			requestsWithoutProgress += 1
			if (requestsWithoutProgress > maxRequestsWithoutProgress) {
				logger.warn({ requests, received }, 'offline batch requests bring nothing more, stop asking')
				stop()
				return
			}
		} else {
			requestsWithoutProgress = 0
		}

		receivedSinceRequest = 0
		requests += 1
		if (requests > 1) {
			logger.info({ requests, received }, 'requesting next offline batch')
		}

		requestBatch(batchSize).catch(error => logger.warn({ error }, 'failed to request offline batch'))
		armIdle()
	}

	const armIdle = () => {
		clearIdle()
		if (!active) {
			return
		}

		idleTimer = setTimeout(() => {
			idleTimer = undefined
			if (active && pending === 0) {
				request()
			}
		}, idleMs)
	}

	return {
		/** `offline_preview` arrived: ask for the first batch. `total` is the preview's `count`, when known. */
		start(total?: number) {
			stop()
			active = true
			expectedTotal = total !== undefined && Number.isFinite(total) && total >= 0 ? total : undefined
			receivedSinceRequest = 0
			pending = 0
			requests = 0
			received = 0
			requestsWithoutProgress = 0
			request()
		},
		/** an offline stanza arrived and is queued for handling */
		onReceived() {
			if (!active) {
				return
			}

			received += 1
			receivedSinceRequest += 1
			pending += 1
			clearIdle()
		},
		/** a queued offline stanza has been handled (and acked) */
		onHandled() {
			if (!active) {
				return
			}

			pending = Math.max(0, pending - 1)
			if (pending > 0) {
				return
			}

			if (receivedSinceRequest >= batchSize) {
				request()
			} else {
				armIdle()
			}
		},
		/** `<ib><offline/>`: the server delivered the whole backlog */
		finish() {
			if (active && requests > 1) {
				logger.info({ requests, received }, 'offline backlog delivered')
			}

			stop()
		},
		stop,
		get isActive() {
			return active
		}
	}
}

export type OfflineBatchPacer = ReturnType<typeof makeOfflineBatchPacer>
