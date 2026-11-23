export default class SocketOptions {
    immediate = false
    recvRoutingId = false
    routingId = ""
    reconnectInterval = 100
    // Milliseconds an outbound WebSocket may stay in CONNECTING before a second,
    // overlapping attempt is started at the same address. Both are abandoned one
    // more interval after that and the endpoint retries after reconnectInterval.
    // 0 makes a single attempt with no deadline.
    //
    // If both attempts reach the peer, the peer sees two connections for a
    // moment and whatever it sends to the discarded one is lost. Enable this
    // only where the connecting side sends first: not against a bound PUSH,
    // DEALER, REQ or PAIR.
    openAttemptInterval = 0
    xpubVerbose = false
}