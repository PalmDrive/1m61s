'use strict';

const schedule = require('node-schedule'),
      date_util = require('date-utils'),
      wechat_pay = require('../lib/wechat_pay'),
      wechat_ctl = require('../lib/wechat'),
      logger = require('../lib/logger');

const cron = schedule.scheduleJob('* * 23 * * *', function() {
  logger.info(`scheduled task..at --{${new Date()}}`);

  const today = Date.today(),
        yesterday = Date.yesterday();
  today.setHours(23);
  yesterday.setHours(23);

  wechat_ctl.getAccessTokenFromCache().then(res => {
    wechat_ctl.queryTodayUserMoney(yesterday, today).then(results => {
      results.map(result => {
        // 发红包
        wechat_pay.fnSendMoney(result.touser, result.money);
        // 发模板消息
        wechat_ctl.sendModelMessage(result, res.access_token);
      });
    });
  });
});

console.log('crontab started.');
