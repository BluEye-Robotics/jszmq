import SocketBase from './socketBase'
import {IEndpoint, Msg} from './types'
import Trie from './utils/trie'
import Distribution from './utils/distribution'
import {concatBytes} from './utils/bytes'

const ONE = new Uint8Array([1])

export default class XSub extends SocketBase {
    subscriptions: Trie
    distribution:Distribution

    constructor() {
        super()
        this.subscriptions = new Trie()
        this.distribution = new Distribution()
    }

    protected attachEndpoint(endpoint:IEndpoint) {
        this.distribution.attach(endpoint)

        this.subscriptions.forEach(s => endpoint.send([concatBytes([ONE, s])]))
    }

    protected hiccuped(endpoint: IEndpoint) {
        this.subscriptions.forEach(s => endpoint.send([concatBytes([ONE, s])]))
    }

    protected endpointTerminated(endpoint:IEndpoint) {
        this.distribution.terminated(endpoint)
    }

    protected xrecv(endpoint:IEndpoint, ...frames: Uint8Array[]) {
        const topic = frames[0]

        const subscribed = this.subscriptions.check(topic, 0, topic.length)
        if (subscribed)
            this.emit('message', ...frames)
    }

    protected xsend(msg:Msg) {
        const frame = msg[0]

        if (!(frame instanceof Uint8Array))
            throw new Error("subscription must be a Uint8Array")

        if (frame.length > 0 && frame[0] === 1) {
            this.subscriptions.add(frame, 1, frame.length - 1)
            this.distribution.sendToAll(msg)
        } else if (frame.length > 0 && frame[0] === 0) {
            // Removing only one subscriptions
            const removed = this.subscriptions.remove(frame, 1, frame.length - 1)
            if (removed)
                this.distribution.sendToAll(msg)
        } else {
            // upstream message unrelated to sub/unsub
            this.distribution.sendToAll(msg)
        }
    }
}
