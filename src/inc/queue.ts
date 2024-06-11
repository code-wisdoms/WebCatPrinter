export class Queue {
    private static queue: any[] = [];
    private static isStarted: boolean = false;
    private static isRunning: boolean = false;
    private static toggle: boolean = false;
    private static callback: any = null

    public static setCallback(callback: any) {
        Queue.callback = callback;
    }
    public static async start() {
        if (Queue.isStarted) {
            return
        }
        Queue.isStarted = true
        let item: any = Queue.queue.shift();
        if (item) {
            Queue.callback && await Queue.callback(item);
        }
    }
    public static push(item: any) {
        Queue.queue.push(item);
    }
    public static async signal() {
        Queue.toggle = !Queue.toggle;
        if (Queue.toggle === true && !Queue.isRunning) {
            Queue.isRunning = true;
            let item: any = Queue.queue.shift();
            if (item) {
                Queue.callback && await Queue.callback(item);
            }
            Queue.isRunning = false;
            if (Queue.queue.length > 0) {
                await Queue.signal()
                await Queue.signal()
            }
        }
    }
}