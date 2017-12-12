'use strict';

// var jsonify = require('redis-jsonify');
const redis = require('redis'),
      config = require(`./config/${process.env.NODE_ENV || 'development'}.json`),
      client = redis.createClient({
        host: config.redis.host,
        port: config.redis.port
      });
// var client = jsonify(redis.createClient());

client.auth(config.redis.password, () => {
  console.log('pass the auth');
});

client.on('connect', function() {
  console.log('redis server connected.');
});

module.exports = client;
