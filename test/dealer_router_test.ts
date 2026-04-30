import 'jasmine'
import * as jsmq from '../src'

const decode = (b: Uint8Array) => new TextDecoder().decode(b)

describe('dealer-router', function () {
    it('ping-pong', function (done) {
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
                done()
            })
        })
    })
})
