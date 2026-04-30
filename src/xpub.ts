import SocketBase from './socketBase'
import {IEndpoint, Msg} from './types'
import MultiTrie from './utils/multiTrie'
import Distribution from './utils/distribution'
import {concatBytes, encodeUtf8} from './utils/bytes'

const ZERO = new Uint8Array([0])

export default class XPub extends SocketBase {
    subscriptions = new MultiTrie()
    distribution = new Distribution()

    constructor() {
        super()

        this.markAsMatching = this.markAsMatching.bind(this)
        this.sendUnsubscription = this.sendUnsubscription.bind(this)
    }

    private markAsMatching(endpoint: IEndpoint) {
        this.distribution.match(endpoint)
    }

    protected sendUnsubscription(endpoint: IEndpoint, data: Uint8Array, size: number) {
        const unsubscription = concatBytes([ZERO, data.subarray(0, size)])
        endpoint.send([unsubscription])
    }

    protected attachEndpoint(endpoint: IEndpoint) {
        this.distribution.attach(endpoint)
    }

    protected endpointTerminated(endpoint: IEndpoint) {
        this.subscriptions.removeEndpoint(endpoint, this.sendUnsubscription)
        this.distribution.terminated(endpoint)
    }

    protected xsend(msg: Msg) {
        let topic: Uint8Array

        if (msg[0] instanceof Uint8Array) {
            topic = msg[0]
        } else {
            topic = encodeUtf8(msg[0] as string)
        }

        this.subscriptions.match(topic, 0, topic.length, this.markAsMatching)
        this.distribution.sendToMatching(msg)
    }

    protected xrecv(endpoint: IEndpoint, subscription:Uint8Array, ...frames: Uint8Array[]) {
        if (subscription.length > 0) {
            const type = subscription[0]
            if (type === 0 || type === 1) {
                let unique

                if (type === 0)
                    unique = this.subscriptions.remove(subscription, 1, subscription.length - 1, endpoint)
                else
                    unique = this.subscriptions.add(subscription, 1, subscription.length - 1, endpoint)

                if (unique || this.options.xpubVerbose)
                    this.xxrecv(endpoint, subscription, ...frames)

                return
            }
        }

        this.xxrecv(endpoint, subscription, ...frames)
    }

    protected xxrecv(endpoint: IEndpoint, ...frames: Uint8Array[]) {
        this.emit('message', ...frames)
    }
}
