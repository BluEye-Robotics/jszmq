import XSub from './xsub'
import {Frame, Msg} from './types'
import {concatBytes, encodeUtf8} from './utils/bytes'

const ONE = new Uint8Array([1])
const ZERO = new Uint8Array([0])

export default class Sub extends XSub {
    subscribe(topic: Frame) {
        if (typeof topic === 'string') {
            const frame = concatBytes([ONE, encodeUtf8(topic)])
            super.xsend([frame])
        } else if (topic instanceof Uint8Array) {
            const frame = concatBytes([ONE, topic])
            super.xsend([frame])
        } else
            throw new Error('unsupported topic type')
    }

    unsubscribe(topic: Frame) {
        if (typeof topic === 'string') {
            const frame = concatBytes([ZERO, encodeUtf8(topic)])
            super.xsend([frame])
        } else if (topic instanceof Uint8Array) {
            const frame = concatBytes([ZERO, topic])
            super.xsend([frame])
        } else
            throw new Error('unsupported topic type')
    }

    xsend(msg: Msg) {
        throw new Error('not supported')
    }
}
