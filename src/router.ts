import SocketBase from './socketBase'
import {includes, pull} from 'lodash'
import {IEndpoint, Msg} from './types'
import {bytesToHex, concatBytes} from './utils/bytes'

const ZERO = new Uint8Array([0])

export default class Router extends SocketBase {
    anonymousPipes: IEndpoint[] = []
    pipes: Map<string, IEndpoint> = new Map<string, IEndpoint>()
    nextId: number = 0

    constructor() {
        super()
        this.options.recvRoutingId = true
    }

    protected attachEndpoint(endpoint: IEndpoint) {
        this.anonymousPipes.push(endpoint)
    }

    protected endpointTerminated(endpoint: IEndpoint) {
        this.pipes.delete(endpoint.routingKeyString)
        pull(this.anonymousPipes, endpoint)
    }

    protected xrecv(endpoint: IEndpoint, ...msg: Uint8Array[]) {
        // For anonymous pipe, the first message is the identity
        if (includes(this.anonymousPipes, endpoint)) {
            pull(this.anonymousPipes, endpoint)

            let routingKey = msg[0]
            if (routingKey.length > 0)
                endpoint.routingKey = concatBytes([ZERO, routingKey])
            else {
                const buffer = new Uint8Array(5)
                buffer[0] = 1
                new DataView(buffer.buffer).setInt32(1, this.nextId, false)
                endpoint.routingKey = buffer
                this.nextId++
            }

            endpoint.routingKeyString = bytesToHex(endpoint.routingKey)
            this.pipes.set(endpoint.routingKeyString, endpoint)

            return
        }

        this.xxrecv(endpoint, endpoint.routingKey, ...msg)
    }

    protected xxrecv(endpoint: IEndpoint, ...msg: Uint8Array[]) {
        this.emit('message', ...msg)
    }

    protected xsend(msg: Msg) {
        if (msg.length <= 1)
            throw new Error('router message must include a routing key')

        const routingKey = msg.shift()
        if (!(routingKey instanceof Uint8Array))
            throw new Error('routing key must be a Uint8Array')

        const endpoint = this.pipes.get(bytesToHex(routingKey))
        if (!endpoint)
            return; // TODO: use mandatory option, if true throw exception here

        endpoint.send(msg)
    }
}
