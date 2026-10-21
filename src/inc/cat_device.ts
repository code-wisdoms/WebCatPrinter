import { PrinterData } from "./cat_image";
import { Commander } from './cat_commands';
import { TextEncoder, CustomFonts, TextOptions } from "./text_encoder";
import { BleDevice } from './ble_adapter';
import { FrameDecoder } from "./protocol";
import { Queue } from "./queue";

export interface PrinterState {
    /** True only after a valid state reply; false means thermal/paper state is unknown. */
    known: boolean;
    out_of_paper: boolean;
    cover: boolean;
    overheat: boolean;
    low_power: boolean;
    pause: boolean;
    busy: boolean;
}

export enum StateFlag {
    out_of_paper = 1,
    cover = 2,
    overheat = 4,
    low_power = 8,
    pause = 16,
    busy = 128,
}

export interface PrinterOptions {
    /** Minimum gap after the last write, including the five-second buffer drain. Default 5000. */
    cooldownMs?: number;
}

export class CatPrinter extends Commander {
    private device: BleDevice
    private text_encoder: TextEncoder
    private energy: number = 12000
    private speed: number = 16
    private print_width = 384
    private mtu: number = 20
    private state: PrinterState = {
        known: false,
        out_of_paper: false,
        cover: false,
        overheat: false,
        low_power: false,
        pause: false,
        busy: false
    }

    constructor(ble_device: BleDevice, options: PrinterOptions = {}) {
        super()
        const cooldown = options.cooldownMs === undefined ? 5000 : options.cooldownMs;
        if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 300000)
            throw new RangeError('cooldownMs must be 0..300000');
        this.cooldownMs = cooldown;
        if (ble_device.device === undefined || ble_device.print_characteristic === undefined || ble_device.notify_characteristic === undefined) {
            throw new Error(' Ble device not valid ensure you have scan for device')
        }

        this.device = ble_device
        this.text_encoder = new TextEncoder(this.print_width)

    }

    /**
     * Print an image loaded from local path or remote url
     * @param path location in filesystem or remote url
     * @returns 
     */
    public async printImage(path: string): Promise<void> {
        const image: PrinterData = await PrinterData.loadImage(path)
        return this.print(image)
    }

    /**
     * Print text whith default font size, to change font size use setFontSize()
     * currently only one font is supported
     * @param text the text to print 
     * @returns 
     */
    public async printText(): Promise<void> {
        const image: PrinterData = await PrinterData.drawText(this.text_encoder.getImage())
        return this.print(image)
    }

    /**
     * Draw a line
     * @param thick thickness in px of the line
     * @returns 
     */
    public async drawSeparator(thick?: number): Promise<void> {
        const thickness = thick === undefined ? 1 : thick;
        if (!Number.isInteger(thickness) || thickness < 1 || thickness > 384)
            throw new RangeError('Separator thickness must be 1..384');
        const line = new Uint8Array(48).fill(255);
        await this.runJob(async () => {
            for (let i = 0; i < thickness; i++) {
                if (i > 0 && i % 64 === 0) await this.refreshStatus();
                await this.drawBitmap(line);
            }
        });
    }

    /**
     * Set the 'ink' strenght or how much dark the print will be
     * @param value number from 1 to 48000 higher is darker default 12000
     */
    public setStrenght(value: number): void {
        if (!Number.isInteger(value) || value < 1 || value > 48000) throw new RangeError("Strength must be 1..48000");
        this.energy = value
    }

    /**
     * Set feed/retract speed hight speed can cause low quality,
     * lower is the value quicker will be the feeding
     * @param value number from 8 to 32; default 16
     */
    public setPrintingSpeed(value: number): void {
        if (!Number.isInteger(value) || value < 8 || value > 32) throw new RangeError("Speed divisor must be 8..32");
        this.speed = value
    }

    /**
     * get device Status
     * @returns PrinterState
     */
    public getPrinterStatus(): PrinterState {
        return { ...this.state, known: this.state.known && !!this.device.device.gatt?.connected }
    }

    /**
     * Disconnect from the bluetooth printer
     * @returns 
     */
    public async disconnect(): Promise<void> {
        this.subscribed?.removeEventListener('characteristicvaluechanged', this.onNotification);
        this.subscribed = undefined;
        this.state.known = false;
        return await this.device.device.gatt?.disconnect()
    }

    public newText(fonts?: CustomFonts[]): void {
        this.text_encoder.newText(fonts)
    }

    public addText(text: string, options: TextOptions): void {
        this.text_encoder.addText(text, options)
    }

    public addRow(columns: string[], options: TextOptions): void {
        this.text_encoder.addRow(columns, options)
    }

    public addSeparator(options?: TextOptions): void {
        this.text_encoder.addSeparator(options)
    }

    public newLine(): void {
        this.text_encoder.newLine()
    }

    public loadFont(font: CustomFonts): void {
        this.text_encoder.loadFont(font)
    }

    /**
     * it will be private
     * send the protocol composed message to the printer slicing it in chunks of mtu lenght if needed
     * @param data the commad message to send
     * @returns 
     */
    private writes = new Queue<() => Promise<void>>(task => task())
    private decoder = new FrameDecoder()
    private subscribed?: BluetoothRemoteGATTCharacteristic
    private paused = false
    private printing = false
    private jobs = new Queue<() => Promise<void>>(task => task())
    private cooldownMs: number
    private pendingJobs = 0
    private jobGeneration = 0
    private phase: 'ready' | 'printing' | 'settling' | 'cooling' = 'ready'
    private statusWaiter?: () => void
    private infoHex: string | null = null
    private nextJobAt = 0
    private readonly sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
    private readonly onNotification = (event: Event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
        if (!value) return;
        const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        for (const frame of this.decoder.push(data)) {
            if (frame.command === 0xae && frame.payload.length === 1) {
                if (frame.payload[0] === 0x10) this.paused = true;
                if (frame.payload[0] === 0) this.paused = false;
            }
            if (frame.command === 0xa3 && frame.payload.length) {
                this.updateStatus(frame.payload[0]);
                this.statusWaiter?.();
            }
            if (frame.command === 0xa8) this.infoHex = Array.from(frame.payload).map(b => ('0' + b.toString(16)).slice(-2)).join('');
        }
    }

    protected send(data: Uint8Array): Promise<void> {
        const operation = this.writes.push(async () => {
            if (!this.device.device.gatt?.connected) {
                throw new Error('Printer disconnected. Reconnect explicitly before starting a new job.');
            }
            const notify = this.device.notify_characteristic;
            if (this.subscribed !== notify) {
                this.subscribed?.removeEventListener('characteristicvaluechanged', this.onNotification);
                this.decoder.reset();
                this.paused = false;
                notify.addEventListener('characteristicvaluechanged', this.onNotification);
                try { await notify.startNotifications(); }
                catch (error) { notify.removeEventListener('characteristicvaluechanged', this.onNotification); throw error; }
                this.subscribed = notify;
            }
            for (const chunk of this.chunkify(data)) {
                const deadline = Date.now() + 30000;
                while (this.paused) {
                    if (!this.device.device.gatt?.connected) throw new Error('Printer disconnected');
                    if (Date.now() > deadline) throw new Error('Printer buffer remained paused for 30 seconds');
                    await this.sleep(50);
                }
                if (data[2] !== 0xa3 && data[2] !== 0xa8 && (this.state.overheat || this.state.out_of_paper || this.state.cover || this.state.low_power || this.state.busy))
                    throw new Error('Printer reports heat, paper, cover, battery or busy state; stop and check printer');
                await this.device.print_characteristic.writeValueWithoutResponse(chunk);
                await this.sleep(15);
            }
        });
        return operation;
    }

    /**
     * execute the printing stack 
     * @param printer_data the data to print
     */
    private async print(printer_data: PrinterData): Promise<void> {
        await this.runJob(async () => {
            const rows = await printer_data.read(Math.floor(this.print_width / 8));
            let i = 0;
            for (const row of rows) {
                if (i > 0 && i % 64 === 0) await this.refreshStatus();
                await this.drawBitmap(row);
                i++;
            }
        });
    }

    public getJobStatus() {
        return { phase: this.phase, pendingJobs: this.pendingJobs,
            remainingMs: Math.max(0, this.nextJobAt - Date.now()) };
    }

    private runJob(draw: () => Promise<void>): Promise<void> {
        this.pendingJobs++;
        const generation = this.jobGeneration;
        const operation = this.jobs.push(async () => {
            if (generation !== this.jobGeneration) throw new Error('Queued print cancelled because an earlier job failed');
            this.printing = true;
            try {
                if (this.nextJobAt > Date.now()) {
                    this.phase = 'cooling';
                    await this.sleep(this.nextJobAt - Date.now());
                }
                this.phase = 'printing';
                await this.prepare();
                await draw();
                await this.finish(70);
                // Cooldown overlaps the buffer drain instead of adding another wait after it.
                this.nextJobAt = Date.now() + Math.max(5000, this.cooldownMs);
                this.phase = 'settling';
                await this.sleep(5000);
            } catch (error) {
                this.jobGeneration++;
                this.nextJobAt = Date.now() + Math.max(5000, this.cooldownMs);
                throw error;
            } finally {
                this.printing = false;
                this.phase = 'ready';
            }
        }).then(
            () => { this.pendingJobs--; },
            error => { this.pendingJobs--; throw error; }
        );
        return operation;
    }

    /**
     * Create an array of parts of messages to send to the printer messages longher than devices' mtu will not be processed by the printer
     * @param data 
     * @returns 
     */
    private chunkify(data: Uint8Array): Uint8Array[] {
        const chunks: Uint8Array[] = []
        for (let i = 0; i < data.length; i += this.mtu) {
            chunks.push(data.slice(i, i + this.mtu))
        }
        return chunks
    }

    /**
     * Stack messages needde before sending printerData
     */
    private async prepare() {
        await this.refreshStatus();
        if (!this.isX6()) await this.setDpi();
        await this.setSpeed(this.speed)
        await this.setEnergy(this.energy)
        await this.applyEnergy()
        if (!this.isX6()) await this.startLattice();
        await this.drawBitmap(new Uint8Array(48));
    }

    /**
     * Stack messages needed after sending printerData
     */
    private async finish(extra_feed: number) {
        if (!this.isX6()) await this.endLattice()
        await this.setSpeed(8)
        await this.feedPaper(extra_feed)
        await this.refreshStatus()
    }

    /** Request a fresh state; silence is an error, never an implicit healthy state. */
    public async refreshStatus(): Promise<PrinterState> {
        if (this.statusWaiter) throw new Error('Status request already pending');
        this.state.known = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const response = new Promise<void>((resolve, reject) => {
            this.statusWaiter = resolve;
            timer = setTimeout(() => reject(new Error('No printer state reply within 3 seconds')), 3000);
        });
        // Attach rejection handling before writing so a slow write cannot leave an unhandled timeout.
        const write = this.getDeviceState();
        try { await Promise.all([write, response]); return this.getPrinterStatus(); }
        finally { clearTimeout(timer); this.statusWaiter = undefined; }
    }

    /** Last raw info payload; requestDeviceInfo waits for the query write, not the reply. */
    public getDeviceInfoHex(): string | null { return this.infoHex; }
    public async requestDeviceInfo(): Promise<void> { await this.getDeviceInfo(); }

    private isX6() { return /^x6/i.test(this.device.device.name || ''); }

    private updateStatus(flags: number) {
        this.state = {
            known: true,
            out_of_paper: !!(flags & StateFlag.out_of_paper),
            cover: !!(flags & StateFlag.cover),
            overheat: !!(flags & StateFlag.overheat),
            low_power: !!(flags & StateFlag.low_power),
            pause: !!(flags & StateFlag.pause),
            busy: !!(flags & StateFlag.busy)
        };
    }
}
