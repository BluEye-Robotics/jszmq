export type Frame = Uint8Array | string
export type Msg = Frame[]

export interface IEndpoint {
    send(msg: Msg):boolean

    close(): void;
    readonly address: string;
    routingKey: Uint8Array;
    routingKeyString: string;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
}

export interface IListener {
    readonly address: string;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    close(): void;
}
