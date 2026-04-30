import SocketBase from './socketBase'
import {IEndpoint} from './types'

export default class Pull extends SocketBase {
    protected attachEndpoint(endpoint: IEndpoint) {

    }

    protected endpointTerminated(endpoint: IEndpoint) {
    }

    protected xrecv(endpoint: IEndpoint, ...frames: Uint8Array[]) {
        this.emit('message', ...frames)
    }
}