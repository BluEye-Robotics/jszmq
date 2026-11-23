import { describe, it, expect } from 'vitest'
import * as jsmq from '../src/index.js'

// Fixed ports below Linux's ephemeral range (32768+), where a client port
// could already hold them.
const addressA = 'ws://localhost:3003'
const addressB = 'ws://localhost:3004'

type Emitter = { once(event: string, listener: (...args: any[]) => void): unknown }

const next = (emitter: Emitter, event: string) =>
    new Promise<unknown[]>(resolve => emitter.once(event, (...args) => resolve(args)))

// Resolves to whether `promise` settled within `ms`.
const within = (promise: Promise<unknown>, ms: number) => Promise.race([
    promise.then(() => true),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), ms)),
])

describe('closing a bound socket', () => {
    it('close() closes the connections it accepted', async () => {
        const pub = new jsmq.XPub()
        const sub = new jsmq.Sub()
        try {
            pub.bind(addressA)
            sub.subscribe('A')
            sub.connect(addressA)
            await next(pub, 'message')

            let pubLost = 0
            pub.on('lost', () => pubLost++)
            const subLost = next(sub, 'lost')
            pub.close()

            expect(pubLost).toBe(1)
            expect(await within(subLost, 1000)).toBe(true)
        } finally {
            pub.close()
            sub.close()
        }
    })

    it('unbind() closes only the connections accepted on that address', async () => {
        const pub = new jsmq.XPub()
        const kept = new jsmq.Sub()
        const dropped = new jsmq.Sub()
        try {
            pub.bind(addressA)
            pub.bind(addressB)
            let subscriptions = 0
            const subscribed = new Promise<void>(resolve => pub.on('message', () => {
                if (++subscriptions === 2)
                    resolve()
            }))
            kept.subscribe('K')
            kept.connect(addressA)
            dropped.subscribe('D')
            dropped.connect(addressB)
            await subscribed

            let keptLost = 0
            kept.on('lost', () => keptLost++)
            const droppedLost = next(dropped, 'lost')
            pub.unbind(addressB)

            expect(await within(droppedLost, 1000)).toBe(true)
            const received = next(kept, 'message')
            pub.send('K')
            expect(new TextDecoder().decode((await received)[0] as Uint8Array)).toBe('K')
            expect(keptLost).toBe(0)
        } finally {
            pub.close()
            kept.close()
            dropped.close()
        }
    })
})
