import { EggConsoleLogger, LoggerLevel } from 'egg-logger';

export class Logger {
    public static silent: boolean;

    public prefix: string;
    public _logger: EggConsoleLogger;

    constructor(prefix: string) {
        this.prefix = prefix;
        this._logger = new EggConsoleLogger({ level: 'DEBUG' });
    }

    public _log(level: LoggerLevel, ...args: any[]) {
        if (args.length && typeof args[0] == 'string') {
            args[0] = `[${this.prefix}] ` + args[0];
        }
        this._logger[level.toLowerCase()](...args);
    }

    public debug(...args: any[]) {
        if (Logger.silent) return;
        this._log('DEBUG', ...args);
    }

    public info(...args: any[]) {
        if (Logger.silent) return;
        this._log('INFO', ...args);
    }

    public warn(...args: any[]) {
        if (Logger.silent) return;
        this._log('WARN', ...args);
    }

    public error(...args: any[]) {
        this._log('ERROR', ...args);
    }

    // 给用户的提示信息
    public show(...args: any[]) {
        this._log('INFO', ...args);
    }
}
