import EventEmitter from './utils/eventEmitter.js'
import SocketOptions from './socketOptions.js'
import {IEndpoint, Msg} from './types.js'
import {concatBytes, encodeUtf8} from './utils/bytes.js'

enum State {
    Closed,
    Connecting,
    Reconnecting,
    Active
}

export default class WebSocketEndpoint extends EventEmitter implements IEndpoint {
    socket!: WebSocket;
    state: State
    frames:Uint8Array[] = []
    queue:Uint8Array<ArrayBuffer>[] = []
    options:SocketOptions
    routingIdReceived = false
    accepted:boolean
    public routingKey:Uint8Array = new Uint8Array(0)
    public routingKeyString = ''
    public address:string
    private readonly openingSockets = new Set<WebSocket>()
    private secondAttemptTimer?: ReturnType<typeof setTimeout>
    private openingDeadline?: ReturnType<typeof setTimeout>
    private reconnectTimer?: ReturnType<typeof setTimeout>

    constructor(address:string|WebSocket, options:SocketOptions) {
        super()
        this.options = options
        this.connect = this.connect.bind(this)

        if (typeof address === 'string') {
            this.address = address
            this.state = State.Connecting
            this.accepted = false

            this.connect()
        } else {
            this.routingIdReceived = false
            this.address = ''
            this.socket = address
            this.accepted = true
            this.state = State.Active
            this.socket.binaryType = "arraybuffer"
            this.socket.onerror = this.error.bind(this)
            this.socket.onclose = this.onClose.bind(this)
            this.socket.onmessage = this.onMessage.bind(this)
            this.send([this.options.routingId])
        }
    }

    private connect() {
        if (this.state === State.Closed)
            return // The socket was already closed, abort

        this.routingIdReceived = false
        // A multipart message cut off by the drop must not prefix the next one.
        this.frames = []
        this.socket = this.openCandidate()

        const interval = this.options.openAttemptInterval
        if (!(interval > 0))
            return

        // Starting a second WebSocket to the same address can wake a stalled
        // Safari LAN handshake. The original attempt can still be the one to open.
        this.secondAttemptTimer = setTimeout(() => {
            // Armed here, not in connect(), so the second attempt gets a full
            // interval even when this timer runs late.
            this.openingDeadline = setTimeout(() => {
                this.cancelOpening()
                this.onClose()
            }, interval)
            this.openCandidate()
        }, interval)
    }

    private openCandidate(): WebSocket {
        const socket = new WebSocket(this.address, ['ZWS2.0'])
        this.openingSockets.add(socket)
        socket.binaryType = "arraybuffer"
        socket.onopen = () => {
            if (!this.openingSockets.delete(socket))
                return

            this.cancelOpening()
            this.socket = socket
            socket.onopen = null
            socket.onerror = this.error.bind(this)
            socket.onclose = this.onClose.bind(this)
            socket.onmessage = this.onMessage.bind(this)
            this.onOpen()
        }
        socket.onerror = () => socket.close()
        socket.onclose = () => {
            if (!this.openingSockets.delete(socket))
                return

            const [remaining] = this.openingSockets
            if (remaining) {
                this.socket = remaining
                return
            }
            this.cancelOpening()
            this.onClose()
        }
        return socket
    }

    private cancelOpening() {
        clearTimeout(this.secondAttemptTimer)
        clearTimeout(this.openingDeadline)
        for (const socket of this.openingSockets) {
            socket.onopen = null
            socket.onerror = null
            socket.onclose = null
            socket.close()
        }
        this.openingSockets.clear()
    }

    onOpen() {
        const oldState = this.state
        this.state = State.Active

        this.send([this.options.routingId])
        this.queue.forEach(frame => this.socket.send(frame))
        this.queue = []

        if (oldState === State.Reconnecting)
            this.emit('hiccuped', this)
        else
            this.emit('attach', this)
    }

    onClose() {
        if (this.accepted) {
            this.state = State.Closed
            this.emit('terminated', this)
        }
        else if (this.state !== State.Closed) {
            // A lost listener may disconnect synchronously and cancel this retry.
            this.reconnectTimer = setTimeout(this.connect, this.options.reconnectInterval)
            if (this.state === State.Active || this.state === State.Connecting)
                this.emit('lost', this)

            if (this.state === State.Active)
                this.state = State.Reconnecting
        }
    }

    error() {
        this.socket.close()
    }

    onMessage(message:MessageEvent) {
        if (!this.routingIdReceived) {
            this.routingIdReceived = true

            if (!this.options.recvRoutingId)
                return
        }

        if (message.data instanceof ArrayBuffer) {
            const buffer = new Uint8Array(message.data)

            if (buffer.length > 0) {
                const more = buffer[0] === 1
                const msg = buffer.subarray(1)

                this.frames.push(msg)

                if (!more) {
                    this.emit("message", this, ...this.frames)
                    this.frames = []
                }
            }
            else
                this.error()
        }
        else
            this.error()
    }

    close() {
        if (this.state !== State.Closed) {
            this.state = State.Closed
            clearTimeout(this.reconnectTimer)
            if (this.openingSockets.size)
                this.cancelOpening()
            else if (this.socket.readyState === this.socket.CONNECTING || this.socket.readyState === this.socket.OPEN)
                this.socket.close()

            this.emit('terminated', this)
        }
    }

    send(msg:Msg) {
        if (this.state === State.Closed)
            return false

        for (let i = 0, len = msg.length; i < len; i++) {
            const isLast = i === len - 1
            const flags = isLast ? 0 : 1

            let frame = msg[i]

            if (typeof frame === 'string')
                frame = encodeUtf8(frame)
            else if (frame instanceof Uint8Array) {
                // Nothing to do, use as is
            } else {
                throw new Error('invalid message type')
            }

            const flagsArray = new Uint8Array(1)
            flagsArray[0] = flags
            const buffer = concatBytes([flagsArray, frame])

            if (this.state === State.Active)
                this.socket.send(buffer)
            else
                this.queue.push(buffer)
        }

        return true
    }
}
