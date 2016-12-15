const schedule = require('node-schedule'),
  wechat_pay = require('../lib/wechat_pay'),
  logger = require('../lib/logger');

const cron = schedule.scheduleJob('* * 23 * * *', function () {
  logger.info(`scheduled task..at --{${new Date()}}`);

  //queryTodayUserMoney
  wechat_pay.fnSendMoney()
});
