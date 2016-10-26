'use strict';

const request = require('request'),
      bosonnlpAPIKey = require(`../config/${process.env.NODE_ENV || 'development'}.json`).bosonnlp.apiKey,
      bosonHeaders = {'X-Token': bosonnlpAPIKey};

const getSummary = (content) => {
  const url = 'http://api.bosonnlp.com/summary/analysis';

  return new Promise((resolve, reject) => {
    request.post({
      url,
      headers: bosonHeaders,
      body: JSON.stringify({content: content})
    }, (err, resp, body) => {
      if (err) { return reject(err); }

      resolve(body);
    });
  });
};

const getKeywords = (content) => {
  const url = 'http://api.bosonnlp.com/keywords/analysis';

  return new Promise((resolve, reject) => {
    request.post({
      url,
      headers: bosonHeaders,
      body: content,
      json: true
    }, (err, resp, body) => {
      if (err) { return reject(err); }

      resolve(body);
    })
  });
};

module.exports = {
  getSummary,
  getKeywords
};
