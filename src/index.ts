import Dealer from './dealer.js'
import Router from './router.js'
import Sub from './sub.js'
import XSub from './xsub.js'
import Pub from './pub.js'
import XPub from './xpub.js'
import Pull from './pull.js'
import Push from './push.js'
import Pair from './pair.js'
import Req from './req.js'
import Rep from './rep.js'

export function socket(type:'dealer'|'router'|'pub'|'sub'|'xsub'|'xpub'|'pull'|'push'|'pair'|'req'|'rep') {

    switch (type) {
        case 'dealer':
            return new Dealer()
        case 'router':
            return new Router()
        case 'pub':
            return new Pub()
        case 'sub':
            return new Sub()
        case 'xsub':
            return new XSub()
        case 'xpub':
            return new XPub()
        case 'pull':
            return new Pull()
        case 'push':
            return new Push()
        case 'pair':
            return new Pair()
        case 'req':
            return new Req()
        case 'rep':
            return new Rep()
        default:
            throw new Error('Unsupported socket type')
    }
}

export {default as Sub} from './sub.js'
export {default as XSub} from './xsub.js'
export {default as Router} from './router.js'
export {default as Dealer} from './dealer.js'
export {default as XPub} from './xpub.js'
export {default as Pub} from './pub.js'
export {default as Push} from './push.js'
export {default as Pull} from './pull.js'
export {default as Pair} from './pair.js'
export {default as Req} from './req.js'
export {default as Rep} from './rep.js'
