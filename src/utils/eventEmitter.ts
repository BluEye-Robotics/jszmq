type Listener = (...args: any[]) => void

export default class EventEmitter {
    private _listeners: Map<string | symbol, Listener[]> = new Map()

    on(event: string | symbol, listener: Listener): this {
        const arr = this._listeners.get(event)
        if (arr) arr.push(listener)
        else this._listeners.set(event, [listener])
        return this
    }

    once(event: string | symbol, listener: Listener): this {
        const wrapper = (...args: any[]) => {
            this.removeListener(event, wrapper)
            listener(...args)
        }
        return this.on(event, wrapper)
    }

    removeListener(event: string | symbol, listener: Listener): this {
        const arr = this._listeners.get(event)
        if (!arr) return this
        const i = arr.indexOf(listener)
        if (i !== -1) arr.splice(i, 1)
        return this
    }

    emit(event: string | symbol, ...args: any[]): boolean {
        const arr = this._listeners.get(event)
        if (!arr || arr.length === 0) return false
        for (const listener of arr.slice()) listener(...args)
        return true
    }
}
