import { createCanvas, registerFont } from './canvas';

export interface CustomFonts {
    path: string
    name: string
}
export interface TextOptions {
    font: string
    font_size: number
    bold?: boolean
    italic?: boolean
    underline?: boolean
    alignment?: 'left' | 'center' | 'right'
    cellPad?: number[]
}

export class TextEncoder {
    private canvas: HTMLCanvasElement | undefined
    private ctx: CanvasRenderingContext2D | undefined
    private current_x: number
    private current_y: number
    private max_width: number
    private current_height: number
    private current_font_height: number

    constructor(width: number) {
        this.current_x = 0
        this.current_y = 0
        this.max_width = width
        this.current_height = 0
        this.current_font_height = 0
    }

    /**
     * Create a new empty text space 
     * @param fonts optionale, load custom fonts 
     */
    public newText(fonts?: CustomFonts[]): void {
        if (fonts) {
            fonts.forEach((font) => {
                registerFont(font.path, font.name)
            })
        }
        if (this.canvas) {
            this.canvas.remove()
        }
        this.canvas = createCanvas(this.max_width, 10000)
        this.ctx = this.canvas.getContext('2d') ?? undefined
        this.current_x = 0
        this.current_y = 0
        this.current_height = 0
        this.current_font_height = 0
    }

    /**
     * Add text to the text area
     * @param text the text to append
     * @param options text options
     */
    public addText(text: string, options: TextOptions): void {
        if (this.canvas && this.ctx) {
            if (options.alignment) {
                const align = options.alignment
                if (align == 'center') {
                    this.addCenter(text, options)
                } else if (align == 'right') {
                    this.addRight(text, options)
                } else {
                    this.addLeft(text, options)
                }
            } else {
                this.addLeft(text, options)
            }
        } else {
            throw new Error('Initialize text first with newText()')
        }
    }

    /**
     * add text to the center of the text area
     * @param text 
     * @param options 
     */
    private addCenter(text: string, options: TextOptions): void {
        this.ctx!.textAlign = "center"
        if (!options) options = { font: 'Arial', font_size: 18 }
        let fontStyle = ''
        if (options.bold) { fontStyle += 'bold ' }
        if (options.italic) { fontStyle += 'italic ' }
        this.ctx!.font = `${fontStyle}${options.font_size}px "${options.font || 'Arial'}"`
        this.current_font_height = this.ctx!.measureText('M').actualBoundingBoxAscent

        if (this.current_y == 0) {
            this.current_y += this.current_font_height
            this.current_height += this.current_font_height
        }

        this.ctx!.fillText(text, this.max_width / 2, this.current_y, this.max_width)
        this.current_x += (this.max_width / 2) + (this.ctx!.measureText(text).width / 2)
        this.current_height += this.current_font_height

    }

    /**
     * Add text right aligned
     * @param text 
     * @param options 
     */
    private addRight(text: string, options: TextOptions): void {
        this.ctx!.textAlign = "right"
        if (!options) options = { font: 'Arial', font_size: 18 }
        let fontStyle = ''
        if (options.bold) { fontStyle += 'bold ' }
        if (options.italic) { fontStyle += 'italic ' }
        this.ctx!.font = `${fontStyle}${options.font_size}px "${options.font || 'Arial'}"`
        this.current_font_height = this.ctx!.measureText('M').actualBoundingBoxAscent

        if (this.current_y == 0) {
            this.current_y += this.current_font_height
            this.current_height += this.current_font_height
        }

        this.ctx!.fillText(text, this.max_width, this.current_y, this.max_width)
        this.current_x += this.max_width
        this.current_height += this.current_font_height
    }

    /**
     * add text left aligned 
     * @param text 
     * @param options 
     */
    private addLeft(text: string, options: TextOptions): void {
        this.ctx!.textAlign = "left"
        if (!options) options = { font: 'Arial', font_size: 16 }
        let fontStyle = ''
        if (options.bold) { fontStyle += 'bold ' }
        if (options.italic) { fontStyle += 'italic ' }
        this.ctx!.font = `${fontStyle}${options.font_size}px "${options.font || 'Arial'}"`
        this.current_font_height = this.ctx!.measureText('M').actualBoundingBoxAscent

        if (this.current_y == 0) {
            this.current_y += this.current_font_height
            this.current_height += this.current_font_height
        }

        const words: string[] = text.split(' ')
        words.forEach((word) => {
            const wordWidth = this.ctx!.measureText(word).width
            if (this.current_x + wordWidth <= this.max_width) {
                this.drawText(word + ' ', options)
            } else {
                this.current_x = 0
                this.current_y += this.current_font_height + 5
                this.current_height += this.current_font_height + 5

                this.drawText(word + ' ', options)
            }
        })
    }

    /**
     * for left aligned text it draws each word and save the current positions
     * @param text 
     * @param options 
     */
    private drawText(text: string, options: TextOptions): void {
        if (this.canvas && this.ctx) {
            if (options.underline) {
                this.ctx.fillText(text, this.current_x, this.current_y)

                const textMetrics = this.ctx.measureText(text)
                this.ctx.beginPath()
                this.ctx.strokeStyle = 'black'
                this.ctx.lineWidth = 1
                this.ctx.moveTo(this.current_x, this.current_y + 1)
                this.ctx.lineTo(this.current_x + textMetrics.width, this.current_y + 2)
                this.ctx.stroke()
            } else {
                this.ctx.fillText(text, this.current_x, this.current_y)
            }
            this.current_x += this.ctx.measureText(text).width
        } else {
            throw new Error('Initialize text first with newText()')
        }
    }

    /**
     * Retrunr the canvas containing the text 
     * @returns Canvas
     */
    public getImage(): HTMLCanvasElement {
        if (this.canvas && this.ctx) {
            const new_canvas = createCanvas(this.canvas.width, this.current_height)
            const new_ctx: CanvasRenderingContext2D | undefined = new_canvas.getContext('2d') ?? undefined
            new_ctx?.drawImage(this.canvas, 0, 0)
            return new_canvas
        } else {
            throw new Error('Initialize text first with newText()')
        }
    }

    /**
     * add a newline in the text area
     */
    public newLine(): void {
        this.current_y += this.current_font_height + 5
        this.current_height += this.current_font_height + 5
        this.current_x = 0
    }

    /**
     * load a custom font 
     * @param font 
     */
    public loadFont(font: CustomFonts): void {
        registerFont(font.path, font.name)
    }

    /**
     * add text row
     * @param columns 
     * @param options 
     */
    public addRow(columns: string[], options: TextOptions): void {
        this.ctx!.textAlign = "left"
        if (!options) options = { font: 'Arial', font_size: 16 }
        let fontStyle = ''
        if (options.bold) { fontStyle += 'bold ' }
        if (options.italic) { fontStyle += 'italic ' }
        if (!options.cellPad) { options.cellPad = [] }
        this.ctx!.font = `${fontStyle}${options.font_size}px "${options.font || 'Arial'}"`
        this.current_font_height = this.ctx!.measureText('M').actualBoundingBoxAscent + 5

        if (this.current_y == 0) {
            this.current_y += this.current_font_height
            this.current_height += this.current_font_height
        }

        for (const i in columns) {
            const num: number = parseInt(i);
            const fontSize = options.cellPad[num] > 0 ? options.font_size - 4 : options.font_size

            this.ctx!.font = `${fontStyle}${fontSize}px "${options.font || 'Arial'}"`
            this.ctx!.fillText(columns[i], this.current_x, this.current_y)

            let cellPad = 0;
            let nextCol: number = num + 1;
            if (options.cellPad[nextCol]) {
                cellPad = -(options.cellPad[nextCol]);
            }
            if (options.cellPad[num]) {
                cellPad = options.cellPad[num];
            }
            this.current_x += (this.max_width / columns.length) + cellPad
        }
    }

    /**
     * add a line separator
     * @param options 
     */
    public addSeparator(options?: TextOptions): void {
        this.ctx!.textAlign = "left"
        if (!options) options = { font: 'Arial', font_size: 16 }
        let fontStyle = ''
        if (options.bold) { fontStyle += 'bold ' }
        if (options.italic) { fontStyle += 'italic ' }
        this.ctx!.font = `${fontStyle}${options.font_size}px "${options.font || 'Arial'}"`
        this.current_font_height = this.ctx!.measureText('M').actualBoundingBoxAscent

        const y_axis = this.current_y - (this.current_font_height * 2) + (this.current_font_height / 3)
        this.current_y += this.current_font_height / 3;

        this.ctx!.beginPath();
        this.ctx!.moveTo(this.current_x, y_axis);
        this.ctx!.lineTo(this.max_width, y_axis);
        this.ctx!.lineWidth = 1;
        this.ctx!.strokeStyle = '#000000';
        this.ctx!.stroke();
        this.ctx!.closePath();
    }
}