'use strict';

const Proxy = require('..');
const { EggConsoleLogger } = require('egg-logger');
const logger = new EggConsoleLogger({ level: 'DEBUG' });

const proxy = new Proxy({ httpPort: 7888, httpsPort: 7889 });

proxy.on('init', () => {
  logger.info('proxy init');
});

proxy.on('error', e => {
  logger.error(e);
});

proxy.on('response', (req, res) => {
  logger.info('req', req);
  logger.info('res', res);
});

proxy.start();
