export class Logger {
    private isVerbose: boolean;

    constructor(isVerbose: boolean) {
        this.isVerbose = isVerbose;
    }

    // Log Messages - IF VERBOSE
    public log(...args: any[]): void {
        if (this.isVerbose) {
            console.log(...args);
        }
    }

    // Debug Messages - IF VERBOSE
    public debug(...args: any[]): void {
        if (this.isVerbose) {
            console.debug(...args);
        }
    }

    // Warn Messages - ALWAYS
    public warn(...args: any[]): void {
        console.warn(...args);
    }

    // Error Messages - ALWAYS
    public error(...args: any[]): void {
        console.error(...args);
    }
}
