import { describe, it, expect } from 'vitest'
import * as jsmq from '../src'

const decode = (b: Uint8Array) => new TextDecoder().decode(b)

describe('dealer-router', () => {
    it('ping-pong', () => new Promise<void>(resolve => {
        const router = new jsmq.Router()
        const dealer = new jsmq.Dealer()
        router.bind('ws://localhost:3002/dealer-router')
        dealer.connect('ws://localhost:3002/dealer-router')

        dealer.send('hello')
        router.once('message', (routingId, message) => {
            expect(decode(message)).toBe('hello')
            router.send([routingId, 'world'])
            dealer.once('message', reply => {
                expect(decode(reply)).toBe('world')
                router.close()
                dealer.close()
                resolve()
            })
        })
    }))
})
