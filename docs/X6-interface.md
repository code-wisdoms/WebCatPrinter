# X6 Bluetooth investigation — 21 October 2026

## Measured on this printer

Connected to advertised `X6`, address `4C:3E:23:BB:D3:DE`, on Windows.
Advertisements carry service `AF30`; actual printing service is `AE30`.
Read the complete discoverable primary-service/characteristic inventory, subscribed
to all four notification/indication channels, and sent only A3/A8 queries.
No printing, motor, energy, firmware-update, or undocumented write commands were sent.
The local capture is `diagnostics/x6-gatt.json` (ignored by Git because it contains
Bluetooth addresses). Reproduce with:

```powershell
.\.venv\Scripts\python.exe tools/inspect_ble.py --address 4C:3E:23:BB:D3:DE --queries --output diagnostics/x6-gatt.json
```

Install `bleak` in a project virtual environment before using the tool. Omit
`--address` to scan; omit `--queries` to inventory/read/subscribe without sending
application commands. Close other printer apps before connecting.

UUIDs below expand to `0000XXXX-0000-1000-8000-00805f9b34fb`.

| Service | Characteristic | Exposed operations | Observed meaning/value |
| --- | --- | --- | --- |
| 1800 | 2A00 | Read, write | Device name, read `X6`; name writes untested |
| AE30 | AE01 | Write without response | Command channel; A3/A8 verified |
| AE30 | AE02 | Notify | Both query responses arrived here |
| AE30 | AE03 | Write without response | Unknown channel; no writes attempted |
| AE30 | AE04 | Notify | Subscription succeeded; silent during queries |
| AE30 | AE05 | Indicate | Subscription succeeded; silent during queries |
| AE30 | AE10 | Read, write | Read four zero bytes; purpose unknown |
| AE3A | AE3B | Write without response | Unknown channel; no writes attempted |
| AE3A | AE3C | Notify | Subscription succeeded; silent during queries |

Each notify/indicate characteristic exposes its standard 2902 subscription
descriptor. No standard battery (180F) or device-information (180A) service was
exposed. Discovery does not enumerate the application commands behind a write
characteristic; unknown channels are not evidence of additional usable features.

## Captured command/reply pairs

Frames: `51 78 COMMAND DIRECTION LENGTH_LE16 PAYLOAD CRC8 FF`.
Direction 0 is request, 1 is response. CRC8 covers payload only (polynomial 07,
initial value zero, no reflection). Integer payload byte order is command specific.

```
A3 request: 51 78 A3 00 01 00 00 00 FF
A3 reply:   51 78 A3 01 03 00 00 14 27 F6 FF
A8 request: 51 78 A8 00 01 00 00 00 FF
A8 reply:   51 78 A8 01 0A 00 4E 00 03 31 2E 33 2E 35 2E 33 58 FF
```

A8 contains firmware text `1.3.5.3` following three binary bytes. The meaning of
those leading bytes is unknown. For A3, the first payload byte was zero. The
legacy interpretation is a bitmask: 01 paper, 02 cover, 04 head hot, 08 low
battery, 80 busy. These meanings come from prior reverse engineering; this session
has not induced each physical fault to validate its bit on this unit.
Do not interpret the additional `14 27` bytes as Celsius or battery percentage:
their meaning has not been established. Zero status means no reported fault at
query time; it does not certify a cool printhead or a working thermal cutoff.

## Feature map and confidence

| Command | Feature | Evidence / current handling |
| --- | --- | --- |
| A3 | Query state | Request/reply verified on this unit; parsed and checked before, during and after jobs |
| A8 | Query info | Request/reply verified; public request and raw payload getter |
| BD | Feed speed divisor | Documented for this family; default changed from 50 to 16; accepted range 8–32 |
| AF | Head energy, uint16 LE | Documented for this family; default changed from 65500 to 12000; range 1–48000 |
| BE | Print mode / energy application | Existing one-byte 01 preserved; other modes untested |
| A2 | Raw 384-dot binary row | Existing LSB-first bitmap path; blank lead row added |
| A1 | Feed, uint16 LE | Existing public feed API; normal jobs now await final 70-row feed |
| A0 | Retract | Existing API retained; operation not verified on this X6 |
| AE, response | Buffer full (10), ready (00) | Documented family flow control; parser tested; not triggered on hardware during this session |
| A4 | Quality | Previously misnamed DPI; not a general resolution control; omitted for X6 |
| A6 | Lattice framing | Retained for other printer names; omitted for X6; not physically tested here |
| BA / BB | Battery / device ID | Reported in family research; payload/response unverified here; not probed |
| CE / CF / BF | Compressed binary / grayscale rows | Reported family extensions; not implemented or tested on this X6 |
| BE variants | Image, text, tattoo, label, grayscale depth | Model dependent; not assumed available on this unit |
| A9 | “Update device” | Purpose unknown; removed from automatic print preparation |

Family references (independent reverse engineering, not vendor guarantees):
[X6h packet captures and command research](https://parzivail.github.io/ble-thermal-printer/),
[legacy state bit definitions](https://github.com/fulda1/Thermal_Printer/wiki/Cat-printer-protocol),
[another X6 family implementation](https://github.com/cicloid/printable/blob/main/docs/PROTOCOL.md#11-x6--x6h-family).
Do not transfer commands from MXW01's different `22 21` protocol to this device.

## Reliability changes and limits

The old code never called its status parser, inverted flag tests, installed
listeners repeatedly, used a shared static queue that advanced on arbitrary
notifications, swallowed write errors, and returned before raster/feed writes
completed. All are addressed in the active print path. The Queue class drives command writes and complete jobs, using separate
instances per printer and completion promises for each queued entry.

The driver now serializes writes per printer, uses conservative 20-byte BLE
chunks with 15 ms pacing, honors AE pause/resume, queues overlapping jobs and rejects
reported faults, and propagates transport failures. It requests state every 64
content rows. A missing state response fails the operation rather than claiming
the printer is healthy. Disconnects require explicit reconnection; there is no
automatic replay of a partly printed image.

The lower energy and speed defaults are starting points, not a calibrated
thermal profile. Jobs wait five seconds for buffered output. The default cooling interval overlaps
that wait. A longer gap can be configured with `cooldownMs` (for example, 30000). These delays are software policy, not measured
thermal limits. A resolved print promise means writes and the settling interval
completed, not a confirmed physical completion event. Direct feed/retract calls
are transport operations and should not be mixed into an active print job.

Hardware validation still needed: one short sparse print at the new defaults,
checking darkness and the final line/feed; then repeated short prints with the
cooldown while recording A3 replies. Do not use dense black stress prints to
discover the heat limit. If heating persists, stop and let it cool; software
cannot establish whether the battery, printhead or protection hardware is faulty.
Learning the remaining features requires captures of the matching vendor app
performing specific actions, or firmware analysis. No exhaustive opcode sweep
was attempted, since writes can activate heating, motors or update modes.

## Validation

`node --test tests/protocol.cjs` checks the actual captured replies, fragmented
frames, CRC rejection, combined fault bits, offset DataViews, single subscription,
job ordering/overlap, energy encoding, write failures, and AE flow control.
`node_modules/.bin/tsc --noEmit` and `npm run build` check types and rebuild all
three bundles. These checks do not validate physical printing or thermal safety.
