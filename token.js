'use strict';
const wechat = require('./lib/wechat');

wechat.getAccessTokenFromCache(undefined, new Date()).then(token => {
  console.log('Token:', token);
  console.log('*done*');
});
