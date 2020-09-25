'use strict';

const { EggConsoleLogger } = require('egg-logger');

class Logger {
  constructor(prefix, slient = false) {
    this.prefix = prefix;
    this.slient = slient;
    this._logger = new EggConsoleLogger({ level: 'DEBUG' });
  }

  _log(level, ...args) {
    if (this.slient) return;
    if (args.length && typeof args[0] == 'string') {
      args[0] = `[${this.prefix}] ` + args[0];
    }
    this._logger[level](...args);
  }

  debug(...args) { this._log('debug', ...args); }
  info(...args) { this._log('info', ...args); }
  warn(...args) { this._log('warn', ...args); }
  error(...args) { this._log('error', ...args); }
}

module.exports = Logger;
