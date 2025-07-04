// Logger class following the Singleton des
export class Logger {
    private isVerbose: boolean;
    static instance: Logger;

    private constructor() {
        this.isVerbose = false;
    }

    static getInstance(): Logger {
        if (!Logger.instance) Logger.instance = new Logger();
        return Logger.instance;
    }

    public setVerbose(v: boolean) {
        this.isVerbose = v;
    }

    public log(...args: any[]): void {
        if (this.isVerbose) {
            console.log(...args);
        }
    }

    public debug(...args: any[]): void {
        if (this.isVerbose) {
            console.debug(...args);
        }
    }

    public warn(...args: any[]): void {
        console.warn(...args);
    }

    public error(...args: any[]): void {
        console.error(...args);
    }
}
