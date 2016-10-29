'use strict';

const ALI = require('aliyun-sdk'),
      ALIConfig = require(`../config/${process.env.NODE_ENV || 'development'}`).aliyun;

module.exports.ctrl = (req, res, next) => {
  const sts = new ALI.STS({
    accessKeyId: ALIConfig.dev.accessKeyId,
    secretAccessKey: ALIConfig.dev.accessKeySecret,
    endpoint: 'https://sts.aliyuncs.com',
    apiVersion: '2015-04-01'
  });

  sts.assumeRole({
    Action: 'AssumeRole',
    RoleArn: 'acs:ram::1518976351624419:role/developer',
    RoleSessionName: 'developer'
  }, (err, result) => {
    if (err) { return next(err); }
    res.send(result);
  });
};
