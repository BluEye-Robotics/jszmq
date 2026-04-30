import { EventEmitter } from 'events'
import SocketOptions from './socketOptions'
import {find, pull} from 'lodash'
import {Frame, IEndpoint, IListener, Msg} from './types'
import WebSocketListener from './webSocketListener'
import * as http from 'http'
import * as https from 'https'
import WebSocketEndpoint from './webSocketEndpoint'

class SocketBase extends EventEmitter {
    private endpoints: IEndpoint[] = []
    private binds: IListener[] = []
    public readonly options = new SocketOptions()
    private readonly endpointAttached: (endpoint: IEndpoint) => void
    private readonly endpointLost: (endpoint: IEndpoint) => void
    private readonly endpointTerminatedInternal: (endpoint: IEndpoint) => void
    private readonly endpointRecovered: (endpoint: IEndpoint) => void

    constructor() {
        super()
        this.bindAttachEndpoint = this.bindAttachEndpoint.bind(this)
        this.bindEndpointTerminated = this.bindEndpointTerminated.bind(this)
        this.attachEndpoint = this.attachEndpoint.bind(this)
        this.endpointTerminated = this.endpointTerminated.bind(this)
        this.xrecv = this.xrecv.bind(this)
        this.hiccuped = this.hiccuped.bind(this)
        this.endpointAttached = (endpoint: IEndpoint) => {
            this.attachEndpoint(endpoint)
            this.emit('ready', endpoint)
        }
        this.endpointLost = (endpoint: IEndpoint) => {
            this.emit('lost', endpoint)
        }
        this.endpointTerminatedInternal = (endpoint: IEndpoint) => {
            this.endpointTerminated(endpoint)
            this.emit('lost', endpoint)
        }
        this.endpointRecovered = (endpoint: IEndpoint) => {
            this.hiccuped(endpoint)
            this.emit('ready', endpoint)
        }
    }

    connect(address: string) {
        if (address.startsWith("ws://") || address.startsWith("wss://")) {
            const endpoint = new WebSocketEndpoint(address, this.options)
            endpoint.on('attach', this.endpointAttached)
            endpoint.on('lost', this.endpointLost)
            endpoint.on('terminated', this.endpointTerminatedInternal)
            endpoint.on('message', this.xrecv)
            endpoint.on('hiccuped', this.endpointRecovered)
            this.endpoints.push(endpoint)
        } else {
            throw new Error('unsupported transport')
        }
    }

    disconnect(address: string) {
        const endpoint = find(this.endpoints, e => e.address === address)

        if (endpoint) {
            endpoint.removeListener('attach', this.endpointAttached)
            endpoint.removeListener('lost', this.endpointLost)
            endpoint.removeListener('terminated', this.endpointTerminatedInternal)
            endpoint.removeListener('message', this.xrecv)
            endpoint.removeListener('hiccuped', this.endpointRecovered)
            endpoint.close()
            pull(this.endpoints, endpoint)
            this.endpointTerminated(endpoint)
            this.emit('lost', endpoint)
        }
    }

    bind(address: string, server?: http.Server | https.Server) {
        if (address.startsWith("ws://") || address.startsWith("wss://")) {
            const listener = new WebSocketListener(address, server, this.options)
            listener.on('attach', this.bindAttachEndpoint)
            this.binds.push(listener)
        } else {
            throw new Error('unsupported transport')
        }
    }

    bindSync(address: string, server?: http.Server | https.Server) {
        return this.bind(address, server)
    }

    unbind(address: string) {
        const listener = find(this.binds, b => b.address === address)

        if (listener) {
            listener.removeListener('attach', this.attachEndpoint)
            listener.close()
            pull(this.binds, listener)
        }
    }

    close() {
        this.binds.forEach(listener => {
            listener.removeListener('attach', this.attachEndpoint)
            listener.close()
        })

        this.binds = []

        this.endpoints.forEach(endpoint => {
            endpoint.removeListener('attach', this.endpointAttached)
            endpoint.removeListener('lost', this.endpointLost)
            endpoint.removeListener('terminated', this.endpointTerminatedInternal)
            endpoint.removeListener('message', this.xrecv)
            endpoint.removeListener('hiccuped', this.endpointRecovered)
            endpoint.close()
            pull(this.endpoints, endpoint)
            this.endpointTerminated(endpoint)
            this.emit('lost', endpoint)
        })
    }

    subscribe(topic: Frame) {
        throw new Error('not supported')
    }

    unsubscribe(topic: Frame) {
        throw new Error('not supported')
    }

    private bindAttachEndpoint(endpoint: IEndpoint) {
        endpoint.on('terminated', this.bindEndpointTerminated)
        endpoint.on('message', this.xrecv)

        this.attachEndpoint(endpoint)
        this.emit('ready', endpoint)
    }

    private bindEndpointTerminated(endpoint: IEndpoint) {
        endpoint.removeListener('terminated', this.bindEndpointTerminated)
        endpoint.removeListener('message', this.xrecv)

        this.endpointTerminated(endpoint)
        this.emit('lost', endpoint)
    }

    protected attachEndpoint(endpoint: IEndpoint) {
    }

    protected endpointTerminated(endpoint: IEndpoint) {

    }

    protected hiccuped(endpoint: IEndpoint) {

    }

    protected xrecv(endpoint: IEndpoint, ...frames: Uint8Array[]) {
    }

    protected xsend(msg: Msg) {

    }

    send(msg: Msg | Frame) {
        if (Array.isArray(msg))
            this.xsend(msg)
        else
            this.xsend([msg])
    }
}

export default SocketBase
