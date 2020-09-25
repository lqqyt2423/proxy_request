'use strict';

const Proxy = require('..');
const { EggConsoleLogger } = require('egg-logger');
const logger = new EggConsoleLogger({ level: 'DEBUG' });

const proxy = new Proxy({ port: 7888 });

proxy.on('error', e => {
  logger.error(e);
});

proxy.on('response', (req, res) => {
  logger.info('req', req);
  logger.info('res', res);
});

proxy.run((err) => {
  if (err) {
    logger.error(err);
    return;
  }

  logger.info('proxy started');
});
