'use strict';

const Proxy = require('..');
const Logger = require('../logger');

const logger = new Logger(__filename);
const proxy = new Proxy({ port: 7888, verbose: true });

proxy.on('error', e => {
  logger.error(e);
});

proxy.run((err) => {
  if (err) {
    logger.error(err);
    return;
  }

  logger.info('proxy started');
});
