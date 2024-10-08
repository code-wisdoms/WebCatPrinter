import { PrinterData } from "./cat_image";
import { Commander } from './cat_commands';
import { TextEncoder, CustomFonts, TextOptions } from "./text_encoder";
import { BleDevice, connect } from './ble_adapter';
import { Queue } from "./queue";

export interface PrinterState {
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

export class CatPrinter extends Commander {
    private device: BleDevice
    private text_encoder: TextEncoder
    private energy: number = 65500
    private speed: number = 50
    private print_width = 384
    private mtu: number = 200
    private state: PrinterState = {
        out_of_paper: false,
        cover: false,
        overheat: false,
        low_power: false,
        pause: false,
        busy: false
    }

    constructor(ble_device: BleDevice) {
        super()
        if (ble_device.device === undefined || ble_device.print_characteristic === undefined) {
            throw new Error(' Ble device not valid ensure you have scan for device')
        }

        this.device = ble_device
        this.text_encoder = new TextEncoder(this.print_width)
        Queue.setCallback(async (item: any) => {
            try {
                await this.device.print_characteristic!.writeValueWithoutResponse(item)
            } catch (error) {
                console.error(error)
            }
        })
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
        let line_thick: number
        thick ? line_thick = thick : line_thick = 1
        const line: Uint8Array = new Uint8Array(48)
        line.fill(255, 0, 47)
        await this.prepare()
        while (line_thick > 0) {
            await this.drawBitmap(line)
            line_thick--
        }
        await this.finish(1)
        return
    }

    /**
     * Set the 'ink' strenght or how much dark the print will be
     * @param value number from 1 to 65500 higher is darker default 65500
     */
    public setStrenght(value: number): void {
        this.energy = value
    }

    /**
     * Set feed/retract speed hight speed can cause low quality,
     * lower is the value quicker will be the feeding
     * @param value number  >= 4 default 34
     */
    public setPrintingSpeed(value: number): void {
        this.speed = value
    }

    /**
     * get device Status
     * @returns PrinterState
     */
    public getPrinterStatus(): PrinterState {
        return this.state
    }

    /**
     * Disconnect from the bluetooth printer
     * @returns 
     */
    public async disconnect(): Promise<void> {
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
    protected async send(data: Uint8Array): Promise<void> {
        if (!this.device.device.gatt?.connected) {
            this.device = await connect(this.device.device);
        }
        await this.device.notify_characteristic?.startNotifications()
        this.device.notify_characteristic?.addEventListener('characteristicvaluechanged', () => {
            Queue.signal()
        })
        const chunks = this.chunkify(data);
        for (const chunk of chunks) {
            Queue.push(chunk);
        }
        await Queue.start();
        return
    }

    /**
     * execute the printing stack 
     * @param printer_data the data to print
     */
    private async print(printer_data: PrinterData): Promise<void> {
        await this.prepare()
        // TODO: consider compression on new devices
        const rows = await printer_data.read(Math.floor(this.print_width / 8))
        for (let row of rows) {
            this.drawBitmap(row)
        }
        this.finish(1)
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
        await this.getDeviceState()
        await this.setDpi()
        await this.setSpeed(this.speed)
        await this.setEnergy(this.energy)
        await this.applyEnergy()
        await this.updateDevice()
        await this.startLattice()
    }

    /**
     * Stack messages needed after sending printerData
     */
    private async finish(extra_feed: number) {
        await this.endLattice()
        await this.setSpeed(8)
        await this.feedPaper(extra_feed)
        await this.getDeviceState()
    }

    private updateStatus(dt: any) {
        let data: Uint8Array = new Uint8Array(dt.buffer);
        const state = data[6]

        this.state = {
            out_of_paper: state === StateFlag.out_of_paper ? false : true,
            cover: state === StateFlag.cover ? false : true,
            overheat: state === StateFlag.overheat ? false : true,
            low_power: state === StateFlag.low_power ? false : true,
            pause: state === StateFlag.pause ? false : true,
            busy: state === StateFlag.busy ? false : true
        }
    }
}