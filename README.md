# WebCatPrinter
I made this as a hobby project for portable cat printers. You can print from your browser in PC, laptop or phone.

### Unsupported Browsers:
As of today, the "Web Bluetooth API" is [not supported by Firefox and Safari](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility).

### Installation:

 1. Clone the project
 2. Run `npm install`
 3. Run `npm run build`
 4. Use the /dist directory in your project

### Example:
Example project is included in /example directory.

### X6 investigation and reliability:
See [the measured X6 interface and feature map](docs/X6-interface.md) for the
Bluetooth inventory, captured firmware/status replies, implemented controls and
remaining unknowns. Defaults now use energy 12000, speed divisor 16, paced writes,
status checks and a five-second buffer drain between queued jobs.
Use `new CatPrinter(device, { cooldownMs: 30000 })` for a longer cooling interval;
this interval overlaps the buffer drain. These settings still need physical
print validation on your unit.

`await printer.refreshStatus()` requests fresh status; check `known` before
interpreting cached `getPrinterStatus()` values. `await printer.requestDeviceInfo()`
sends an info query; `getDeviceInfoHex()` returns the last received payload.
`await printer.printText()` now waits for raster/feed writes and a settling delay;
remove any extra calls to the internal `finish()` method from existing callers.

Run regression checks with `npm test` and build with `npm run build`.

### Credits:
Thanks to [@MarieCMDM](https://github.com/MarieCMDM) for inspiration from the [MeowPrinter](https://github.com/MarieCMDM/MeowPrinter) project.

### License
MIT
