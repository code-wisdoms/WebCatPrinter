const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { test } = require('node:test');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
    fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }
).outputText, filename);
const { FrameDecoder, crc8 } = require('../src/inc/protocol.ts');
const { CatPrinter } = require('../src/inc/cat_device.ts');
function reply(command, payload) {
    return Uint8Array.from([0x51, 0x78, command, 1, payload.length, 0, ...payload, crc8(Uint8Array.from(payload)), 255]);
}
function fakePrinter(flags = 0) {
    const packets = [];
    let pending = [];
    let listener;
    let subscriptions = 0;
    const notify = {
        addEventListener(_, callback) { listener = callback; },
        removeEventListener() { listener = undefined; },
        async startNotifications() { subscriptions++; }
    };
    function emit(data) {
        const backing = Uint8Array.from([99, ...data, 99]);
        listener({ target: { value: new DataView(backing.buffer, 1, data.length) } });
    }
    const printer = new CatPrinter({
        device: { name: 'X6', gatt: { connected: true } },
        notify_characteristic: notify,
        print_characteristic: { async writeValueWithoutResponse(chunk) {
            pending.push(...chunk);
            const length = pending.length >= 6 ? (pending[4] | pending[5] << 8) + 8 : Infinity;
            if (pending.length === length) {
                const packet = Uint8Array.from(pending); pending = []; packets.push(packet);
                if (packet[2] === 0xa3) emit(reply(0xa3, [flags, 0x14, 0x27]));
            }
        } }
    });
    printer.sleep = async () => {};
    return { printer, packets, emit, subscriptions: () => subscriptions };
}
test('real X6 captures decode when fragmented or coalesced', () => {
    const state = Uint8Array.from(Buffer.from('5178a3010300001427f6ff', 'hex'));
    const info = Uint8Array.from(Buffer.from('5178a8010a004e0003312e332e352e3358ff', 'hex'));
    const decoder = new FrameDecoder();
    assert.deepEqual(decoder.push(state.slice(0, 5)), []);
    const frames = decoder.push(Uint8Array.from([...state.slice(5), ...info]));
    assert.deepEqual(frames.map(f => f.command), [0xa3, 0xa8]);
    assert.deepEqual(Array.from(frames[0].payload), [0, 20, 39]);
    assert.equal(crc8(Uint8Array.of(0x10)), 0x70);
});
test('corrupt frame cannot clear a heat fault', () => {
    const decoder = new FrameDecoder();
    const corrupt = reply(0xa3, [0]); corrupt[7] ^= 1;
    assert.equal(decoder.push(corrupt).length, 0);
    assert.equal(decoder.push(reply(0xa3, [4])).length, 1);
});
test('combined status flags, offset DataView, one subscription and fault guard', async () => {
    const f = fakePrinter(5);
    const state = await f.printer.refreshStatus();
    assert.equal(state.known, true);
    assert.equal(state.overheat, true);
    assert.equal(state.out_of_paper, true);
    assert.equal(state.low_power, false);
    await f.printer.refreshStatus();
    assert.equal(f.subscriptions(), 1);
    await assert.rejects(f.printer.drawSeparator(), /stop and check/);
    assert.ok(f.packets.every(p => p[2] === 0xa3));
});
test('job awaits every row and feed, uses low energy, omits A9', async () => {
    const f = fakePrinter();
    const job = f.printer.print({ read: async () => [new Uint8Array(48).fill(128), new Uint8Array(48)] });
    await job;
    const commands = f.packets.map(p => p[2]);
    assert.deepEqual(commands, [0xa3, 0xbd, 0xaf, 0xbe, 0xa2, 0xa2, 0xa2, 0xbd, 0xa1, 0xa3]);
    const energy = f.packets.find(p => p[2] === 0xaf);
    assert.equal(energy[6] | energy[7] << 8, 12000);
    const ink = f.packets.filter(p => p[2] === 0xa2)[1];
    assert.equal(ink[6], 1);
});
test('write failures reject job and prevent later rows', async () => {
    const f = fakePrinter();
    f.printer.device.print_characteristic.writeValueWithoutResponse = async () => { throw new Error('radio failed'); };
    await assert.rejects(f.printer.drawSeparator(), /radio failed/);
    assert.equal(f.printer.printing, false);
});
test('pause/resume uses AE flow control instead of arbitrary notifications', async () => {
    const f = fakePrinter();
    await f.printer.refreshStatus();
    f.emit(reply(0xae, [0x10]));
    assert.equal(f.printer.paused, true);
    f.emit(reply(0xa8, [0]));
    assert.equal(f.printer.paused, true);
    f.emit(reply(0xae, [0]));
    assert.equal(f.printer.paused, false);
    assert.throws(() => f.printer.setStrenght(-1), RangeError);
    assert.throws(() => f.printer.setPrintingSpeed(255), RangeError);
});

test('Queue runs overlapping jobs in order without interleaving', async () => {
    const f = fakePrinter();
    const first = f.printer.drawSeparator(1);
    const second = f.printer.drawSeparator(2);
    await Promise.all([first, second]);
    const commands = f.packets.map(p => p[2]);
    const one = [0xa3, 0xbd, 0xaf, 0xbe, 0xa2, 0xa2, 0xbd, 0xa1, 0xa3];
    const two = [0xa3, 0xbd, 0xaf, 0xbe, 0xa2, 0xa2, 0xa2, 0xbd, 0xa1, 0xa3];
    assert.deepEqual(commands, [...one, ...two]);
    assert.equal(f.printer.getJobStatus().pendingJobs, 0);
});
test('Queue cancels waiting jobs on failure and accepts a later retry', async () => {
    const f = fakePrinter();
    const write = f.printer.device.print_characteristic.writeValueWithoutResponse;
    f.printer.device.print_characteristic.writeValueWithoutResponse = async () => { throw new Error('radio failed'); };
    const results = await Promise.allSettled([f.printer.drawSeparator(), f.printer.drawSeparator()]);
    assert.match(results[0].reason.message, /radio failed/);
    assert.match(results[1].reason.message, /cancelled/);
    assert.equal(f.printer.getJobStatus().pendingJobs, 0);
    f.printer.device.print_characteristic.writeValueWithoutResponse = write;
    await f.printer.drawSeparator();
});
