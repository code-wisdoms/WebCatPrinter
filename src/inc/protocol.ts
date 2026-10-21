/** Incremental legacy Cat frame decoder. Discards corrupt frames without updating state. */
export function crc8(data: Uint8Array): number {
    let crc = 0;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 128) ? 7 : 0)) & 255;
    }
    return crc;
}

export class FrameDecoder {
    private buffer: number[] = [];
    reset() { this.buffer = []; }
    push(data: Uint8Array): { command: number; payload: Uint8Array }[] {
        this.buffer.push(...data);
        const frames = [];
        while (this.buffer.length >= 8) {
            if (this.buffer[0] !== 0x51 || this.buffer[1] !== 0x78) {
                this.buffer.shift(); continue;
            }
            const length = this.buffer[4] | (this.buffer[5] << 8);
            if (length > 512) { this.buffer.shift(); continue; }
            if (this.buffer.length < length + 8) break;
            const payload = new Uint8Array(this.buffer.slice(6, 6 + length));
            if (this.buffer[length + 7] !== 255 || crc8(payload) !== this.buffer[length + 6]) {
                this.buffer.shift(); continue;
            }
            if (this.buffer[3] === 1) frames.push({ command: this.buffer[2], payload });
            this.buffer.splice(0, length + 8);
        }
        return frames;
    }
}
