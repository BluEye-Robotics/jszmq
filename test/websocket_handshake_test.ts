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

    it('only opens a second candidate for the endpoint that is still connecting', () => {
        const sub = new jsmq.Sub()
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
        const dealer = new jsmq.Dealer()
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
        const sub = new jsmq.Sub()
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
        const sub = new jsmq.Sub()
        const ready = vi.fn()
        const lost = vi.fn()
        sub.on('ready', ready).on('lost', lost)
        sub.connect(endpointUrl)
        vi.advanceTimersByTime(handshakeTimeout)
        expect(sockets).toHaveLength(2)
        const [failed, pending] = order === 'original' ? sockets : [...sockets].reverse()
        failed.finishClose()
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
        const sub = new jsmq.Sub()
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
        const sub = new jsmq.Sub()
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
