import XPub from './xpub.js'
import {IEndpoint} from './types.js'

export default class Pub extends XPub {
    protected xxrecv(endpoint: IEndpoint, ...frames: Uint8Array[]) {
        // Drop any message sent to pub socket
    }

    protected sendUnsubscription() {

    }
}
