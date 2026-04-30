import { WebSocketServer, WebSocket as WSWebSocket } from 'ws'
import {URL} from 'url'
import EventEmitter from './utils/eventEmitter'
import SocketOptions from './socketOptions'
import Endpoint from './webSocketEndpoint'
import * as http from 'http'
import * as https from 'https'
import * as net from "net"
import {IListener} from './types'

type HttpServer = http.Server | https.Server

class HttpServerListener {
    servers = new Map<string, WebSocketServer>()

    constructor(private server:HttpServer) {
        server.on('upgrade', this.onUpgrade.bind(this))
    }

    onUpgrade(request:http.IncomingMessage, socket: net.Socket, head: Buffer) {
        let wsServer: WebSocketServer

        if (request.url) {
            const path = new URL(request.url, 'http://x').pathname

            if (path) {
                const wsServer = this.servers.get(path)

                if (wsServer) {
                    wsServer.handleUpgrade(request, socket, head, function done(ws) {
                        wsServer.emit('connection', ws, request)
                    })
                    return
                }
            }
        }

        socket.destroy()
    }

    add(path:string, wsServer: WebSocketServer) {
        this.servers.set(path, wsServer)
    }

    remove(path:string) {
        this.servers.delete(path)

        if (this.servers.size === 0)
            listeners.delete(this.server)
    }
}

const listeners = new Map<HttpServer, HttpServerListener>()

function getHttpServerListener(httpServer:HttpServer) {
    let listener = listeners.get(httpServer)

    if (listener)
        return listener

    listener = new HttpServerListener(httpServer)
    listeners.set(httpServer, listener)

    return listener
}

export default class WebSocketListener extends EventEmitter implements IListener {
    server:WebSocketServer
    path:string|undefined

    constructor(public address:string, private httpServer: HttpServer | undefined, private options:SocketOptions) {
        super()
        this.onConnection = this.onConnection.bind(this)

        if (!WebSocketServer)
            throw 'binding websocket is not supported on browser'

        const url = new URL(address)

        let port

        if (url.port)
            port = Number(url.port)
        else if (url.protocol === 'wss')
            port = 443
        else if (url.protocol == 'ws')
            port = 80
        else
            throw new Error('not a websocket address')

        if (httpServer) {
            this.server = new WebSocketServer({noServer: true})
            const listener = getHttpServerListener(httpServer)
            this.path = url.pathname
            listener.add(url.pathname, this.server)
        } else {
            this.server = new WebSocketServer({
                port: port,
                path: url.pathname
            })
        }


        this.server.on('connection', this.onConnection)
    }

    onConnection(connection:WSWebSocket) {
        const endpoint = new Endpoint(connection as unknown as WebSocket, this.options)
        this.emit('attach', endpoint)
    }

    close(): void {
        if (this.path && this.httpServer)
            getHttpServerListener(this.httpServer).remove(this.path)

        this.server.close()
    }
}
