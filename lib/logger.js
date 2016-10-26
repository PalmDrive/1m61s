'use strict';

const env = process.env.NODE_ENV || 'development',
      _ = require('underscore'),
      config = require(`../config/${env}.json`),
      winston = require('winston'),
      Logentries = require('winston-logentries'),
      logger = new winston.Logger({
        transports: [
          new winston.transports.Logentries({token: config.logentries.token})
        ]
      });

module.exports = {
  info(msg, options) {
    let defaultOptions = {
      console: env === 'development',
      logentries: env !== 'development'
    };

    _.extend(defaultOptions, options || {});

    if (defaultOptions.console) {
      console.log(msg);
    }

    if (defaultOptions.logentries) {
      if (_.isObject(msg)) {
        msg = JSON.stringify(msg);
      }
      logger.info(msg);
    }
  }
};
