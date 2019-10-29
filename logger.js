'use strict';

const { EggConsoleLogger } = require('egg-logger');

const logger = new EggConsoleLogger({ level: 'DEBUG' });

module.exports = logger;
