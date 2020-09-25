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
  .parse();

const { verbose, port } = program;

const Proxy = require('..');
const Logger = require('../logger');


const proxy = new Proxy({ port, verbose });
const logger = new Logger('proxy');

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
