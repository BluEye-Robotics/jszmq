# jszmq Copilot Instructions

## Build and test commands

Use `npm ci` to install dependencies in a clean checkout.

Use `npm run check` for TypeScript validation. This repository does not define a separate lint script.

Use `npm run build` to compile the library to `lib/` from `src/`.

Use `npm test` for the full test suite. This runs `npm run build:test` first, clears `lib/`, then compiles the tests into `lib/test` and runs Jasmine with `jasmine.json`.

Use `npm run build:test` when you want the compiled test output without running the suite.

To run a single suite or spec, build the tests first and then use Jasmine's filter:

```sh
npm run build:test
./node_modules/.bin/jasmine --reporter=jasmine-console-reporter --config=jasmine.json --filter='reqrep'
./node_modules/.bin/jasmine --reporter=jasmine-console-reporter --config=jasmine.json --filter='simple request response'
```

## High-level architecture

This library is a JavaScript/TypeScript port of ZeroMQ-style sockets over the ZWS 2.0 WebSocket transport. The current code only supports `ws://` and `wss://` addresses even though some README examples still show `tcp://`.

`src/index.ts` is a thin export layer. The real design is:

- `SocketBase` owns connection lifecycle, `bind`/`connect` plumbing, and the public `send` API. It wires endpoint events into overridable hooks: `attachEndpoint`, `endpointTerminated`, `hiccuped`, `xrecv`, and `xsend`.
- `WebSocketEndpoint` is the transport adapter for a single peer. It performs the ZWS handshake by exchanging the routing id as the first frame, reconnects client sockets after disconnects, and frames each WebSocket payload with a leading one-byte "more frames follow" flag.
- `WebSocketListener` wraps `ws.Server` for bind-side sockets. When a caller passes an existing HTTP/HTTPS server, it multiplexes multiple ZMQ sockets by URL path on the same underlying server.
- Socket patterns are implemented by subclassing `SocketBase` and composing small routing/fanout helpers:
  - `Dealer` and `Push` use `LoadBalancer` for round-robin delivery, queuing outbound messages until an endpoint is ready.
  - `Router` promotes a newly attached endpoint from anonymous to addressable after it receives the peer identity frame, then requires outbound messages to start with a routing-key `Buffer`.
  - `Req` and `Rep` extend `Dealer`/`Router` to enforce request/reply state machines. Both rely on the empty delimiter frame used by ZeroMQ envelopes.
  - `XPub`/`XSub` implement subscription distribution. `Trie` and `MultiTrie` hold topic prefixes, and `Distribution` tracks active vs matching endpoints for targeted fanout.

The test suite is mostly integration-style. Tests import directly from `src/`, open real WebSocket listeners on localhost, and verify protocol behavior end-to-end rather than mocking transport internals.

## Key repository conventions

Inbound `message` events always deliver `Buffer` frames. Public `send` accepts either a single frame or an array of frames, where each frame may be a `Buffer` or string; transport code normalizes strings to UTF-8 buffers before sending.

If you add a new socket type or change pattern behavior, preserve the `SocketBase` hook model instead of bypassing it. The subclass boundary is the main extension mechanism in this codebase.

`Sub` intentionally disables generic `send`; subscriptions must go through `subscribe()` and `unsubscribe()`. Subscription control frames are encoded as a leading byte (`1` for subscribe, `0` for unsubscribe) followed by the topic bytes.

Reconnect behavior matters. `WebSocketEndpoint` queues outbound frames while reconnecting, and `XSub` resends stored subscriptions from its trie in both `attachEndpoint` and `hiccuped` so reconnects restore filtering state.

`Router` identities are binary. When sending through `Router`, the first frame must be the routing key as a `Buffer`, not a string.

`Pub` inherits `XPub` matching behavior but drops inbound application messages. Subscription traffic still flows through the XPUB path.

When changing tests, remember the compiled test output lands in `lib/test`, and `npm run build:test` clears `lib/` first. Do not assume previously built library artifacts are still present after running tests.
