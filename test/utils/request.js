'use strict'

/**
 * Helper method for supertest request
 * Import the app and set public key in the header
 */

var _ = require('underscore'),
    request = require('supertest'),
    app = require('../../app'),
    config = require(`../../config/${process.env.NODE_ENV || 'development'}.json`),
    publicKeyHeaderField = 'x-ailingual-key';

module.exports = (params) => {
  let r = request(app),
      defaultParams = {
        url: '',
        method: 'get',
        setPublicKey: true
      };

  params = _.extend(defaultParams, params);

  switch (params.method) {
    case 'post':
      r = r.post(params.url);
      break;
    case 'put':
      r = r.put(params.url);
      break;
    case 'delete':
      r = r.del(params.url);
      break;
    default:
      r = r.get(params.url);
      break;
  }

  if (params.setPublicKey) {
    r = r.set(publicKeyHeaderField, config.appPublicKey);
  }

  return r;
}
