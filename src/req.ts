import Dealer from './dealer'
import {IEndpoint, Msg} from './types'

export default class Req extends Dealer {
    private static bottom = new Uint8Array(0)

    // If true, request was already sent and reply wasn't received yet or
    // was received partially.
    receivingReply: boolean

    constructor() {
        super()
        this.receivingReply = false
    }

    protected xsend(msg: Msg) {
        // If we've sent a request and we still haven't got the reply,
        // we can't send another request.
        if (this.receivingReply)
            throw new Error("cannot send another request")

        const withBottom = [Req.bottom, ...msg]
        super.xsend(withBottom)

        this.receivingReply = true
    }

    protected xrecv(endpoint: IEndpoint, bottom:Uint8Array, ...frames: Uint8Array[]) {
        // If request wasn't send, we can't process reply, drop.
        if (!this.receivingReply)
            return

        //  Skip messages until one with the right first frames is found.
        if (frames.length === 0 || bottom.length !== 0)
            return

        this.receivingReply = false

        super.xrecv(endpoint, ...frames)
    }
}
