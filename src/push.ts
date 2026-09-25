import SocketBase from './socketBase.js'
import LoadBalancer from './utils/loadBalancer.js'
import {IEndpoint, Msg} from './types.js'

export default class Push extends SocketBase {
    private loadBalancer = new LoadBalancer()
    private pending: Msg[] = []

    protected attachEndpoint(endpoint: IEndpoint) {
        this.loadBalancer.attach(endpoint)

        while(true) {
            const msg = this.pending.shift()
            if (!msg)
                break

            if (!this.loadBalancer.send(msg))
                break
        }
    }

    protected endpointTerminated(endpoint: IEndpoint) {
        this.loadBalancer.terminated(endpoint)
    }

    protected xsend(msg: Msg) {
        if (!this.loadBalancer.send(msg))
            this.pending.push(msg)
    }
}