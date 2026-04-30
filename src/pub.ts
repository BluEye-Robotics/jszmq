import XPub from './xpub'
import {IEndpoint} from './types'

export default class Pub extends XPub {
    protected xxrecv(endpoint: IEndpoint, ...frames: Uint8Array[]) {
        // Drop any message sent to pub socket
    }

    protected sendUnsubscription() {

    }
}
