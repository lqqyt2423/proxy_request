import * as util from 'util';

enum LogLevelEnum {
    debug,
    info,
    warn,
    error
}

export type LogLevel = keyof typeof LogLevelEnum;

export class Logger {
    public static silent = false;
    public static level: LogLevel = 'info';

    public name: string;
    private _log: Console;

    constructor(name: string) {
        this.name = name;
        this._log = console;
    }

    private prefix(level: LogLevel): string {
        const now = new Date();
        const timeStr = util.format(
            '%s-%s-%s %s:%s:%s,%s',
            now.getFullYear(),
            (now.getMonth() + 1).toString().padStart(2, '0'),
            now.getDate().toString().padStart(2, '0'),
            now.getHours().toString().padStart(2, '0'),
            now.getMinutes().toString().padStart(2, '0'),
            now.getSeconds().toString().padStart(2, '0'),
            now.getMilliseconds().toString().padStart(3, '0')
        );
        const lineStart = util.format('%s %s [%s] ', timeStr, level, this.name);
        return lineStart;
    }

    private log(level: LogLevel, ...args: any[]) {
        if (LogLevelEnum[Logger.level] > LogLevelEnum[level]) return;

        const lineStart = this.prefix(level);
        if (args.length && typeof args[0] == 'string') {
            args[0] = lineStart + args[0];
        } else {
            args.unshift(lineStart);
        }

        this._log[level](...args);
    }

    public debug(...args: any[]) {
        if (Logger.silent) return;
        this.log('debug', ...args);
    }

    public info(...args: any[]) {
        if (Logger.silent) return;
        this.log('info', ...args);
    }

    public warn(...args: any[]) {
        if (Logger.silent) return;
        this.log('warn', ...args);
    }

    public error(...args: any[]) {
        if (Logger.silent) return;
        this.log('error', ...args);
    }

    // 给用户的提示信息
    public show(...args: any[]) {
        this.log('info', ...args);
    }
}
