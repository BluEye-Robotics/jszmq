import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as jsmq from '../src/index.js'

const handshakeTimeout = 10_000
const retryInterval = 250
const endpointUrl = 'ws://127.0.0.1:5555'
const sockets: BrowserSocket[] = []

class BrowserSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readonly CONNECTING = BrowserSocket.CONNECTING
    readonly OPEN = BrowserSocket.OPEN
    readonly CLOSING = BrowserSocket.CLOSING
    readonly CLOSED = BrowserSocket.CLOSED
    readyState = this.CONNECTING
    onopen: ((event: { target: BrowserSocket }) => void) | null = null
    onclose: ((event: { target: BrowserSocket }) => void) | null = null
    onerror: ((event: { target: BrowserSocket }) => void) | null = null
    onmessage: ((event: { data: ArrayBuffer }) => void) | null = null
    send = vi.fn<(frame: Uint8Array) => void>()

    constructor(
        readonly url: string,
        readonly protocols: string[]
    ) {
        sockets.push(this)
    }

    open() {
        this.readyState = this.OPEN
        this.onopen?.({ target: this })
    }

    close() {
        // The browser can delay delivering the close event after an abort.
        this.readyState = this.CLOSING
    }

    finishClose() {
        this.readyState = this.CLOSED
        this.onclose?.({ target: this })
    }

    // A refused or failed connection: the browser fires error, then close.
    fail() {
        this.onerror?.({ target: this })
        this.finishClose()
    }

    // One ZWS 2.0 frame from the peer: a flags byte, then the body.
    receive(frame: Uint8Array) {
        this.onmessage?.({ data: frame.slice().buffer })
    }
}

function withRecovery<T extends { options: { openAttemptInterval: number } }>(socket: T): T {
    socket.options.openAttemptInterval = handshakeTimeout
    return socket
}

// blueye-ts drops a connection by closing endpoint.socket directly.
function endpointSocket(socket: object): BrowserSocket {
    return (socket as { endpoints: { socket: BrowserSocket }[] }).endpoints[0].socket
}

// A clock whose overdue timers all run back to back on the next wake-up, as a
// browser does after sleep or in a throttled background tab.
function sleepyClock() {
    let now = 0
    let nextId = 1
    const timers = new Map<number, { at: number, run: () => void }>()
    vi.stubGlobal('setTimeout', (run: () => void, delay = 0) => {
        timers.set(nextId, { at: now + delay, run })
        return nextId++
    })
    vi.stubGlobal('clearTimeout', (id?: number) => {
        if (id !== undefined)
            timers.delete(id)
    })

    return {
        wakeAfter(elapsed: number) {
            now += elapsed
            for (;;) {
                const [due] = [...timers].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at)
                if (!due)
                    return
                timers.delete(due[0])
                due[1].run()
            }
        },
    }
}

describe('WebSocket opening handshakes', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('WebSocket', BrowserSocket)
        sockets.length = 0
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it('makes a single attempt with no deadline unless openAttemptInterval is set', () => {
        const sub = new jsmq.Sub()
        sub.connect(endpointUrl)
        expect(vi.getTimerCount()).toBe(0)
        vi.advanceTimersByTime(handshakeTimeout * 6)
        expect(sockets).toHaveLength(1)
        expect(sockets[0].readyState).toBe(sockets[0].CONNECTING)
    })

    it('gives the second attempt a full interval when overdue timers run back to back', () => {
        const clock = sleepyClock()
        const sub = withRecovery(new jsmq.Sub())
        sub.connect(endpointUrl)
        clock.wakeAfter(handshakeTimeout * 3)
        expect(sockets).toHaveLength(2)
        const [first, second] = sockets
        expect(first.readyState).toBe(first.CONNECTING)
        expect(second.readyState).toBe(second.CONNECTING)
        clock.wakeAfter(handshakeTimeout - 1)
        expect(second.readyState).toBe(second.CONNECTING)
        clock.wakeAfter(1)
        expect(first.readyState).toBe(first.CLOSING)
        expect(second.readyState).toBe(second.CLOSING)
    })

    it('retries once after a refusal that arrives before the second attempt', () => {
        const sub = withRecovery(new jsmq.Sub())
        sub.options.reconnectInterval = retryInterval
        const lost = vi.fn()
        sub.on('lost', lost)
        sub.connect(endpointUrl)
        vi.advanceTimersByTime(5)
        sockets[0].fail()
        expect(lost).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(1)
        vi.advanceTimersByTime(retryInterval)
        expect(sockets).toHaveLength(2)
        // The refused round's second attempt must not fire into the new round.
        vi.advanceTimersByTime(handshakeTimeout - 1)
        expect(sockets).toHaveLength(2)
        vi.advanceTimersByTime(1)
        expect(sockets).toHaveLength(3)
        expect(lost).toHaveBeenCalledTimes(1)
    })

    it('only opens a second candidate for the endpoint that is still connecting', () => {
        const sub = withRecovery(new jsmq.Sub())
        sub.connect('ws://127.0.0.1:5556')
        sub.connect('ws://127.0.0.1:5557')
        const [stalled, healthy] = sockets
        healthy.open()

        vi.advanceTimersByTime(handshakeTimeout - 1)
        expect(sockets).toHaveLength(2)
        vi.advanceTimersByTime(1)
        expect(sockets).toHaveLength(3)
        expect(sockets[2].url).toBe(stalled.url)
        expect(sockets[2].protocols).toEqual(['ZWS2.0'])
        expect(stalled.readyState).toBe(stalled.CONNECTING)
        expect(healthy.readyState).toBe(healthy.OPEN)
    })

    it.each(['original', 'second'])('sends the identity and queued message once when the %s socket wins', (order) => {
        const dealer = withRecovery(new jsmq.Dealer())
        dealer.options.routingId = 'A'
        dealer.options.reconnectInterval = retryInterval
        const ready = vi.fn()
        const lost = vi.fn()
        dealer.on('ready', ready).on('lost', lost)
        dealer.connect(endpointUrl)
        dealer.send([Uint8Array.of(0x21), Uint8Array.of(0x22)])
        vi.advanceTimersByTime(handshakeTimeout)
        expect(sockets).toHaveLength(2)

        const [winner, loser] = order === 'original' ? sockets : [...sockets].reverse()
        winner.open()
        expect(loser.readyState).toBe(loser.CLOSING)
        loser.finishClose()
        vi.advanceTimersByTime(handshakeTimeout + retryInterval)
        expect(ready).toHaveBeenCalledTimes(1)
        expect(lost).not.toHaveBeenCalled()
        expect(winner.send.mock.calls).toEqual([
            [Uint8Array.of(0, 0x41)],
            [Uint8Array.of(1, 0x21)],
            [Uint8Array.of(0, 0x22)],
        ])
        expect(loser.send).not.toHaveBeenCalled()
        expect(sockets).toHaveLength(2)

        winner.finishClose()
        dealer.send(Uint8Array.of(0x42))
        vi.advanceTimersByTime(retryInterval)
        expect(lost).toHaveBeenCalledTimes(1)
        expect(sockets).toHaveLength(3)
        expect(sockets[2].url).toBe(endpointUrl)
        sockets[2].open()
        expect(sockets[2].send.mock.calls).toEqual([[Uint8Array.of(0, 0x41)], [Uint8Array.of(0, 0x42)]])
        expect(ready).toHaveBeenCalledTimes(2)
    })

    it('aborts two hanging handshakes and retries once, even when both close callbacks arrive late', () => {
        const sub = withRecovery(new jsmq.Sub())
        sub.options.reconnectInterval = retryInterval
        const lost = vi.fn()
        sub.on('lost', lost)
        sub.connect(endpointUrl)
        vi.advanceTimersByTime(handshakeTimeout * 2 - 1)
        expect(sockets).toHaveLength(2)
        const [first, second] = sockets
        expect(first.readyState).toBe(first.CONNECTING)
        expect(second.readyState).toBe(second.CONNECTING)
        vi.advanceTimersByTime(1)
        expect(first.readyState).toBe(first.CLOSING)
        expect(second.readyState).toBe(second.CLOSING)
        vi.advanceTimersByTime(retryInterval - 1)
        expect(sockets).toHaveLength(2)
        vi.advanceTimersByTime(1)
        expect(sockets).toHaveLength(3)
        expect(sockets[2].url).toBe(endpointUrl)
        sockets[2].open()
        first.finishClose()
        second.finishClose()
        vi.advanceTimersByTime(handshakeTimeout * 2)
        expect(lost).toHaveBeenCalledTimes(1)
        expect(sockets).toHaveLength(3)
    })

    it.each(['original', 'second'])('keeps the other handshake alive when the %s candidate closes early', (order) => {
        const sub = withRecovery(new jsmq.Sub())
        const ready = vi.fn()
        const lost = vi.fn()
        sub.on('ready', ready).on('lost', lost)
        sub.connect(endpointUrl)
        vi.advanceTimersByTime(handshakeTimeout)
        expect(sockets).toHaveLength(2)
        const [failed, pending] = order === 'original' ? sockets : [...sockets].reverse()
        failed.finishClose()
        expect(endpointSocket(sub)).toBe(pending)
        vi.advanceTimersByTime(retryInterval)
        expect(sockets).toHaveLength(2)
        expect(pending.readyState).toBe(pending.CONNECTING)
        pending.open()
        vi.advanceTimersByTime(handshakeTimeout)
        expect(ready).toHaveBeenCalledTimes(1)
        expect(lost).not.toHaveBeenCalled()
        expect(sockets).toHaveLength(2)
    })

    it.each([
        [1, 1],
        [handshakeTimeout, 2],
        [handshakeTimeout * 2, 2],
    ])('does not reconnect after disconnecting at %i ms', (elapsed, expectedAttempts) => {
        const sub = withRecovery(new jsmq.Sub())
        sub.options.reconnectInterval = retryInterval
        sub.connect(endpointUrl)
        vi.advanceTimersByTime(elapsed)
        expect(sockets).toHaveLength(expectedAttempts)
        sub.disconnect(endpointUrl)
        for (const socket of sockets) {
            expect(socket.readyState).toBe(socket.CLOSING)
            socket.finishClose()
        }
        expect(vi.getTimerCount()).toBe(0)
        vi.advanceTimersByTime(handshakeTimeout * 2 + retryInterval)
        expect(sockets).toHaveLength(expectedAttempts)
    })

    it('closes every pending endpoint and cancels their second attempts when the socket closes', () => {
        const sub = withRecovery(new jsmq.Sub())
        sub.connect('ws://127.0.0.1:5556')
        sub.connect('ws://127.0.0.1:5557')
        vi.advanceTimersByTime(handshakeTimeout - 1)
        expect(sockets).toHaveLength(2)
        sub.close()

        for (const socket of sockets) {
            expect(socket.readyState).toBe(socket.CLOSING)
            socket.finishClose()
        }
        expect(vi.getTimerCount()).toBe(0)
        vi.advanceTimersByTime(handshakeTimeout * 2)
        expect(sockets).toHaveLength(2)
    })

    it('cancels the retry when a lost listener disconnects the endpoint', () => {
        const sub = new jsmq.Sub()
        sub.options.reconnectInterval = retryInterval
        sub.once('lost', () => sub.disconnect(endpointUrl))
        sub.connect(endpointUrl)
        const [socket] = sockets
        socket.open()
        socket.finishClose()

        expect(vi.getTimerCount()).toBe(0)
        vi.advanceTimersByTime(handshakeTimeout * 2 + retryInterval)
        expect(sockets).toHaveLength(1)
    })
})

describe('Connected endpoints', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('WebSocket', BrowserSocket)
        sockets.length = 0
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it('keeps subscribing on an open endpoint after disconnecting one that never opened', () => {
        const sub = new jsmq.Sub()
        sub.connect('ws://127.0.0.1:5556')
        sub.connect('ws://127.0.0.1:5557')
        const [open, connecting] = sockets
        open.open()
        sub.disconnect(connecting.url)
        sub.subscribe('t')
        expect(open.send.mock.calls).toEqual([[Uint8Array.of(0)], [Uint8Array.of(0, 1, 0x74)]])
    })

    it('keeps a Dealer sending on an open endpoint after disconnecting one that never opened', () => {
        const dealer = new jsmq.Dealer()
        dealer.connect('ws://127.0.0.1:5556')
        dealer.connect('ws://127.0.0.1:5557')
        const [open, connecting] = sockets
        open.open()
        dealer.disconnect(connecting.url)
        dealer.send('x')
        expect(open.send.mock.calls).toEqual([[Uint8Array.of(0)], [Uint8Array.of(0, 0x78)]])
    })

    it('drops a multipart message cut off by a reconnect', () => {
        const dealer = new jsmq.Dealer()
        dealer.options.reconnectInterval = retryInterval
        const received = vi.fn()
        dealer.on('message', received)
        dealer.connect(endpointUrl)
        const [first] = sockets
        first.open()
        first.receive(Uint8Array.of(0)) // the peer's routing id
        first.receive(Uint8Array.of(1, 0x41)) // more frames follow
        first.finishClose()
        vi.advanceTimersByTime(retryInterval)
        expect(sockets).toHaveLength(2)
        const second = sockets[1]
        second.open()
        second.receive(Uint8Array.of(0))
        second.receive(Uint8Array.of(0, 0x42))
        expect(received.mock.calls).toEqual([[Uint8Array.of(0x42)]])
    })
})
