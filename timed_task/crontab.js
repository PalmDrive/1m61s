'use strict';

const schedule = require('node-schedule'),
  date_util = require('date-utils'),
  wechat_pay = require('../lib/wechat_pay'),
  wechat_ctl = require('../controllers/wechat.js'),
  logger = require('../lib/logger');


const cron = schedule.scheduleJob('* * 23 * * *', function () {
  logger.info(`scheduled task..at --{${new Date()}}`);

  const today = Date.today(),
    yesterday = Date.yesterday();
  today.setHours(23);
  yesterday.setHours(23);

  data = wechat_ctl.queryTodayUserMoney(yesterday, today);

  data = wechat_ctl.sendModelMessage(data, accessToken);

  //queryTodayUserMoney

  wechat_pay.fnSendMoney(open_id, money);

});

console.log("crontab started.")
