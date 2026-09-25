import SocketBase from './socketBase.js'
import {IEndpoint} from './types.js'

export default class Pull extends SocketBase {
    protected attachEndpoint(endpoint: IEndpoint) {

    }

    protected endpointTerminated(endpoint: IEndpoint) {
    }

    protected xrecv(endpoint: IEndpoint, ...frames: Uint8Array[]) {
        this.emit('message', ...frames)
    }
}