/** Per-printer FIFO. Each push resolves only after its callback finishes. */
export class Queue<T> {
    private queue: { item: T; resolve: () => void; reject: (error: unknown) => void }[] = [];
    private isRunning = false;

    constructor(private callback: (item: T) => Promise<void>) {}

    public push(item: T): Promise<void> {
        const completion = new Promise<void>((resolve, reject) => {
            this.queue.push({ item, resolve, reject });
        });
        void this.start();
        return completion;
    }

    public async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        try {
            while (this.queue.length) {
                const entry = this.queue.shift()!;
                try {
                    await this.callback(entry.item);
                    entry.resolve();
                } catch (error) {
                    entry.reject(error);
                }
            }
        } finally {
            this.isRunning = false;
        }
    }
}
