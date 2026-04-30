const utf8Encoder = new TextEncoder()

export function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
    let total = 0
    for (const p of parts)
        total += p.byteLength

    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) {
        out.set(p, offset)
        offset += p.byteLength
    }
    return out
}

export function encodeUtf8(s: string): Uint8Array {
    return utf8Encoder.encode(s)
}

export function bytesToHex(b: Uint8Array): string {
    let hex = ''
    for (let i = 0; i < b.length; i++)
        hex += (b[i] >>> 4).toString(16) + (b[i] & 0xf).toString(16)
    return hex
}
