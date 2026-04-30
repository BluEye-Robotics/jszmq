import { describe, it, expect } from 'vitest'
import * as jsmq from '../src'

const decode = (b: Uint8Array) => new TextDecoder().decode(b)

describe('pubsub', () => {
    it('subscribe', () => new Promise<void>(resolve => {
        const pub = new jsmq.XPub()
        const sub = new jsmq.Sub()

        pub.bind('ws://localhost:55556')
        sub.subscribe('A')
        sub.connect('ws://localhost:55556')

        // Waiting for subscriptions before publishing
        pub.once('message', () => {
            pub.send('B')
            pub.send('AAA')

            sub.once('message', topic => {
                expect(decode(topic)).toBe('AAA')
                pub.close()
                sub.close()
                resolve()
            })
        })
    }))

    it('unsubscribe', () => new Promise<void>(resolve => {
        const pub = new jsmq.XPub()
        const sub = new jsmq.Sub()

        pub.bind('ws://localhost:55556')
        sub.subscribe('A')
        sub.subscribe('B')
        sub.connect('ws://localhost:55556')

        // Waiting for subscriptions before publishing
        pub.once('message', () => {
            pub.send('A')
            sub.once('message', topic => {
                sub.unsubscribe('A')
                pub.send('A')
                pub.send('B')

                sub.once('message', topic2 => {
                    expect(decode(topic2)).toBe('B')
                    pub.close()
                    sub.close()
                    resolve()
                })
            })
        })
    }))
})