jszmq
======

jszmq is a port of zeromq to JavaScript, focused on **browser** runtimes via the WebSocket transport ([ZWS 2.0](https://rfc.zeromq.org/spec:45/ZWS/)).

The API mirrors [zeromq.js](https://github.com/zeromq/zeromq.js).

## Requirements

- Browser-first: consumed through a bundler (Vite, webpack, esbuild, tsx, etc.). The package ships ESM only with extensionless internal imports.
- Node ≥22 if used server-side (relies on the global `WebSocket`).

## Compatibility with ZeroMQ

The WebSocket transport is supported by [zeromq](https://github.com/zeromq/libzmq) when compiled from source.

Other ports of zeromq (NetMQ for C#, JeroMQ for Java) don't yet support the WebSocket transport.

## Compatibility with ZWS 1.0, zwssock, JSMQ and NetMQ.WebSockets

Not compatible with ZWS 1.0.

## Installation

```
pnpm add @blueyerobotics/jszmq
```

## Supported socket types

* Pub
* Sub
* XPub
* XSub
* Dealer
* Router
* Req
* Rep
* Push
* Pull
* Pair

## How to use

```js
import * as zmq from '@blueyerobotics/jszmq'
```

### Creating a socket

Either via the socket type class:

```js
const dealer = new zmq.Dealer()
```

or via the `socket` factory (matches zeromq.js):

```js
const dealer = zmq.socket('dealer')
```

### Bind

`bind` is **Node-only** (it starts a WebSocket server). Browsers can only `connect`.

```js
import { Router } from '@blueyerobotics/jszmq'

const router = new Router()
router.bind('ws://localhost:80')
```

You can also share an existing HTTP server across multiple sockets:

```js
import { createServer } from 'http'
import { Rep, Pub } from '@blueyerobotics/jszmq'

const server = createServer()

const rep = new Rep()
const pub = new Pub()

rep.bind('ws://localhost:80/reqrep', server)
pub.bind('ws://localhost:80/pubsub', server)

server.listen(80)
```

`bindSync` is an alias for `bind`, kept for zeromq.js compatibility.

### Sending

`send` accepts a single frame or an array of frames. Each frame is either a `string` (encoded as UTF-8) or a `Uint8Array`.

```js
socket.send('Hello')                                      // single frame
socket.send(['Hello', 'World'])                           // multiple frames
socket.send([new TextEncoder().encode('Hello')])          // raw bytes
```

### Receiving

Sockets emit a `message` event. Each frame is passed as a separate argument to the listener; every frame is a `Uint8Array`.

```js
const decode = (b) => new TextDecoder().decode(b)

socket.on('message', msg => console.log(decode(msg)))                              // one frame
socket.on('message', (a, b) => console.log(decode(a), decode(b)))                  // two frames
socket.on('message', (...frames) => frames.forEach(f => console.log(decode(f))))   // any number
```

## Examples

### Push/Pull

A producer pushes work onto a socket and a worker pulls it.

**producer.js**

```js
import { Push } from '@blueyerobotics/jszmq'

const sock = new Push()
sock.bind('ws://127.0.0.1:3000')
console.log('Producer bound to port 3000')

setInterval(() => {
  console.log('sending work')
  sock.send('some work')
}, 500)
```

**worker.js**

```js
import { Pull } from '@blueyerobotics/jszmq'

const decode = (b) => new TextDecoder().decode(b)
const sock = new Pull()
sock.connect('ws://127.0.0.1:3000')
console.log('Worker connected to port 3000')

sock.on('message', msg => {
  console.log('work:', decode(msg))
})
```

### Pub/Sub

**Publisher: pubber.js**

```js
import { Pub } from '@blueyerobotics/jszmq'

const sock = new Pub()
sock.bind('ws://127.0.0.1:3000')
console.log('Publisher bound to port 3000')

setInterval(() => {
  console.log('sending a multipart message envelope')
  sock.send(['kitty cats', 'meow!'])
}, 500)
```

**Subscriber: subber.js**

```js
import { Sub } from '@blueyerobotics/jszmq'

const decode = (b) => new TextDecoder().decode(b)
const sock = new Sub()
sock.connect('ws://127.0.0.1:3000')
sock.subscribe('kitty cats')
console.log('Subscriber connected to port 3000')

sock.on('message', (topic, message) => {
  console.log('topic:', decode(topic), 'message:', decode(message))
})
```
