#!/usr/bin/env node

'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

program
  .version(pkg.version)
  .description(pkg.description)
  .option('--no-verbose', 'don\'t show log')
  .option('-v --verbose', 'show verbose log', true)
  .option('-p --port <number>', 'define proxy server port', 7888)
  .option('-i --intercept', 'intercept(decrypt) https requests', false)
  .option('--genRootCA', 'generate root certificate', false)
  .parse();

const { verbose, port, intercept, genRootCA } = program;
const Logger = require('../logger');
const logger = new Logger('fwproxy');

if (genRootCA) {
  const ca = require('../ca');
  ca.init()
    .then(resp => {
      if (!resp.generate) {
        logger.info('根证书已存在: %s', resp.pemFilename);
      }
    });
}

else {
  const Proxy = require('..');
  const proxy = new Proxy({ port, verbose, interceptHttps: intercept });

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

}
