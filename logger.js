'use strict';

const { EggConsoleLogger } = require('egg-logger');

const logger = new EggConsoleLogger({ level: 'DEBUG' });

['debug', 'info', 'warn', 'error'].forEach(level => {
  const fn = logger[level];
  logger[level] = function(...args) {
    if (args.length && typeof args[0] === 'string') {
      args[0] = '[proxy_request] ' + args[0];
    }
    fn.call(logger, ...args);
  };
});

module.exports = logger;
