'use strict';

const request = require('request'),
      leanCloud = require('../lib/lean_cloud'),
      LeanCloud = leanCloud.AV,
      logger = require('../lib/logger'),
      compare = require('../lib/compare_transcript'),
      wechatConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).wechat,
      redisClient = require('../redis_client'),
      domainString = process.env.NODE_ENV === 'production' ? 'http://1m61s-service.xiaobandengapp.com' : 'http://1m61s-service-staging.xiaobandengapp.com';

// 定时任务发红包
const queryTodayUserMoney = (date1, date2) => {
  console.log('queryMoney start');
  const q1 = new LeanCloud.Query("WeChatUser");
  q1.equalTo('role', 'A');
  const q2 = new LeanCloud.Query("WeChatUser");
  q2.equalTo('role', '帮主');
  const query = LeanCloud.Query.or(q1, q2);
  query.limit(1000);
  // query.equalTo('open_id', 'oslYRxM3YFbMEa3B4t_etQ5Xijxc'); // ff production
  // query.equalTo('open_id', 'oXrsBv-Gl6tjcwTIlCCqQzEAYoWg'); // xxs staging
  return query.find().then(results => {
    let shouldSendMoney = [];
    const promiseArray = results.map(user => {
      const openId = user.get('open_id');
      // console.log('openId： ' + openId);
      return getUserTaskData(openId, date1, date2, user).then(data => {
        console.log('data:' + JSON.stringify(data));
        if (data.totalTaskAmount >= 1) {
          shouldSendMoney.push(data);
        }
      });
    });
    return Promise.all(promiseArray).then(() => {
      return shouldSendMoney;
    });
  }).catch(e => {
    console.log('E2: ' + JSON.stringify(e));
  });
};

// 查询一个用户今天的所有任务并计算错误率
const getUserTaskData = (openId, date1, date2, user) => {
  let totalTaskAmount = 0,
      xxTaskAmount = 0,
      xxWrongTaskAmount = 0,
      xxWordsAmount = 0,
      xxWrongWordsAmount = 0,
      errorTask = [];

  const queryTask0 = new LeanCloud.Query('CrowdsourcingTask');
  queryTask0.equalTo('user_id', openId);
  queryTask0.equalTo('status', 1);
  queryTask0.greaterThanOrEqualTo('completed_at', date1);
  queryTask0.lessThanOrEqualTo('completed_at', date2);
  const totalTaskAmountPromise = queryTask0.count().then(count => {
    return totalTaskAmount = count;
  });

  // 2.0 source  filter xx
  const queryTask1 = new LeanCloud.Query('CrowdsourcingTask');
  queryTask1.equalTo('source', 1.1);
  const queryTask2 = new LeanCloud.Query('CrowdsourcingTask');
  queryTask2.equalTo('source', 2.1);

  // 2.1 other filter
  const queryTask = LeanCloud.Query.or(queryTask1, queryTask2);
  queryTask.equalTo('last_user', openId);
  queryTask.greaterThanOrEqualTo('completed_at', date1);
  queryTask.lessThanOrEqualTo('completed_at', date2);
  queryTask.greaterThanOrEqualTo('createdAt', date1);
  queryTask.lessThanOrEqualTo('createdAt', date2);

  // 2.2 query task by last_user
  const xxTasksPromise = queryTask.find().then(resultsTask => {
    xxTaskAmount = resultsTask.length;
    // console.log('openId： ' + openId + 'xxTaskAmount:' + xxTaskAmount);
    const promiseArray = resultsTask.map(task => {
      const fragmentId = task.get('fragment_id');

      // 3 query UserTranscript by objectId
      const queryUserTranscript = new LeanCloud.Query('UserTranscript');
      return queryUserTranscript.get(fragmentId).then(resultsUserTranscript => {
        const content1 = resultsUserTranscript.get('content'),
              targetTranscriptId = resultsUserTranscript.get('targetTranscript').id;
        logger.info(`content1: ${content1}`);

        // 4 query UserTranscript by targetTranscriptId and user_role
        let queryUserTranscript1 = new LeanCloud.Query('UserTranscript');
        const queryUserTranscript2 = new LeanCloud.Query('UserTranscript');
        queryUserTranscript1.equalTo('user_role', '帮主');
        queryUserTranscript2.equalTo('user_role', '工作人员');
        queryUserTranscript1 = LeanCloud.Query.or(queryUserTranscript1, queryUserTranscript2);
        queryUserTranscript1.equalTo('targetTranscript', LeanCloud.Object.createWithoutData('Transcript', targetTranscriptId));
        queryUserTranscript1.descending('createdAt');

        return queryUserTranscript1.first().then(resultsUserTranscript1 => {
          if (!resultsUserTranscript1) {
            return 0;
          }
          
          const content2 = resultsUserTranscript1.get('content');
          logger.info(`content2: ${content2}`);

          // 计算错字
          const wordsCurrent = compare.getTotalWords(content2.replace(/xx/gi, '')),
                wordsOri = compare.getTotalWords(content1.replace(/xx/gi, '')),
                wordsDifferent = compare.diffWords(wordsOri, wordsCurrent),
                wordsDiff = wordsDifferent.diffCount,
                content1List = wordsDifferent.hightLightResult,
                content2List = compare.hightLightDiffWords(wordsCurrent, wordsOri);
          xxWordsAmount += wordsCurrent.length;// 总字数
          if (wordsDiff >= 1) {
            xxWrongWordsAmount += wordsDiff;//错字数量
            xxWrongTaskAmount += 1; // 错的任务数量
            errorTask.push({
              content1: content1List, content2: content2List, wrongWordsAmount: wordsDiff, 
              audioURL: resultsUserTranscript1.get('fragment_src')
            });
          }
          console.log('content1: '+ content1);
          console.log('content2: '+ content2);
          console.log('wordsDiff: '+ wordsDiff);
          return xxWordsAmount; // Can return anything
        });
      });
    });

    return Promise.all(promiseArray);
  });

  return Promise.all([totalTaskAmountPromise, xxTasksPromise]).then(results => {
    const calculateWrongWords = (openId, date1, date2, user, isLookDetail) => {
      
      const wrongWordsRate = xxTaskAmount === 0 ? 0 : (xxWrongWordsAmount / xxWordsAmount).toFixed(2),
            wrongTaskRate = xxTaskAmount === 0 ? 0 : (xxWrongTaskAmount / xxTaskAmount).toFixed(2),
            rightTaskRate = 1 - wrongTaskRate,
            todayMoney = totalTaskAmount * rightTaskRate * 0.125, // 应发的钱数
            todayMoney1 = todayMoney.toFixed(2);
      // 计算错字率
      let wrongWordsRateList = user.get('wrong_words_rate') || [],
          rewardRate = user.get('reward_rate') || 0, // 昨天准确率
          totalTaskAmountLC = user.get('total_task_amount') || 0, // 总片段数
          yesterdayTotalSalary = user.get('totalSalary') || 0,
          yesterdayMoney = yesterdayTotalSalary > 0 && yesterdayTotalSalary < 1 ? yesterdayTotalSalary : 0;

      if (isLookDetail) {
        const reward =  todayMoney * rewardRate,
            reward1 = reward.toFixed(2);
        console.log('errorTask:' + JSON.stringify({errorTask, reward1, rewardRate}));
        return {errorTask, reward: reward1, rewardRate: rewardRate * 100};
      }

      if (wrongWordsRate > 0.005) { 
        wrongWordsRateList.push(wrongWordsRate);
        if (wrongWordsRateList.length === 3) {
          user.set('role', 'C');
          wrongWordsRateList = [];
        }
      } else {
        wrongWordsRateList = [];
      }

      switch (true) {
        case rightTaskRate >= 0.7 && rightTaskRate < 0.8:
          rewardRate += 0.05;
          break;
        case rightTaskRate >= 0.8 && rightTaskRate < 0.9:
          rewardRate += 0.07;
          break;
        case rightTaskRate >= 0.9 && rightTaskRate <= 1:
          rewardRate += 0.2;
          break;
        default:
          rewardRate = 0;
          break;
      }
      if (rewardRate > 1) {
        rewardRate = 1;
      }

      const reward =  todayMoney * rewardRate,
            reward1 = reward.toFixed(2),
            totalSalary = parseFloat((todayMoney * (1 + rewardRate) + yesterdayMoney).toFixed(2));
      user.set('wrong_words_rate', wrongWordsRateList);
      user.set('reward_rate', parseFloat(rewardRate.toFixed(2)));
      user.set('salary', parseFloat(todayMoney1));
      user.set('totalSalary', totalSalary);
      user.set('right_task_rate', rightTaskRate);
      user.set('task_amount', totalTaskAmount);// 昨天任务数

      if (totalTaskAmount > 0) {
        console.log('userJson------------:' + JSON.stringify(user));
        return user.save().then(user => {
          return {touser: openId, money: todayMoney1, xxTaskAmount, totalTaskAmount, xxWrongTaskAmount, date1: date1.toLocaleString(), date2: date2.toLocaleString(), reward: reward1, rightTaskRate: rightTaskRate, yesterdayMoney: yesterdayMoney, totalSalary: totalSalary};
        }).catch(e => {
          console.log('user save error: ' + JSON.stringify(e));
        });
      } else {
        return new Promise((res,rej) => {
           res({totalTaskAmount: 0});
        });
      }
    };

    const isLookDetail = user ? false : true;
    if (isLookDetail) {
      const query = new LeanCloud.Query('WeChatUser');
      query.equalTo('open_id', openId);
      // console.log('query:' +  JSON.stringify(query));
      return query.first().then(result => {
        // console.log('user:' + JSON.stringify(result));
        user = result;
        return calculateWrongWords(openId, date1, date2, user, isLookDetail);
      });
    } else {
      return calculateWrongWords(openId, date1, date2, user, isLookDetail);
    }
  });
};

// 发送模板消息
const sendModelMessage = (data, accessToken) => {
  console.log('sendModelMessage:'+JSON.stringify(data));
  logger.info(`sendModelMessage-- data:${JSON.stringify(data)}`);
  try {
  request.post({
    url: `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
    json: true,
    body:  {
      touser: data.touser,
      template_id: wechatConfig.templateId.completeTask,
      url: `${domainString}/web/detailTask?openId=${data.touser}&date1=${data.date1}&date2=${data.date2}`,
      data: {
        first: {
          value: `细节至关重要，它值得被耐心等待。\n恭喜你，今天的正确率是${data.rightTaskRate * 100}%，正确率奖励${data.reward}元！`,
          color: '#173177'
        },
        keynote1: {
          value: '任务反馈',
          color: '#173177'
        },
        keynote2: {
          value: `完成了${data.totalTaskAmount}个片段`,
          color: '#173177'
        },
        remark: {
          value: `正确片段的薪酬：${data.money}元 \n正确率奖励：${data.reward}元 \n之前累计未发放金额：${data.yesterdayMoney}元 \n总收入：${data.totalSalary} \n\n！！！请注意！！！\n 1）不满1元将累计至满1元发放！\n 2）如果连续3天正确率过低，将会被取消“领取任务”功能！\n 3）如果正确率大于90%，当日将多获得20%的薪酬奖励，每日叠加，直到100%！`,
          color: '#000000'
        }
      }
    }
  }, (error, response, body) => {
    if (error) return logError('sendModelMessage--err: ', error);
    logger.info(`sendModelMessage--response: ${JSON.stringify(response)}`);
    logger.info(`sendModelMessage--body: ${JSON.stringify(body)}`);
  });
  } catch(e) {
    console.dir(e);
  }
};

const logError = (message, err) => {
  logger.info('Error: ' + message + '.');
  logger.info(err);
};

const getAccessTokenFromWechat = () => {
  console.log('get access token from wechat...');
  const APPID = wechatConfig.appId,
        APPSECRET = wechatConfig.appSecret,
        url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`;
  return new Promise((resolve, reject) => {
    request({
      url,
      json: true
    }, (error, response, body) => {
      if (error) return reject(error);

      if (body.errcode) {
        reject(body);
      } else {
        resolve(body);
      }
    });
  });
};

const getAccessTokenFromCache = (options, startedAt) => {
  console.log('get access token from cache...');
  options = options || {};
  const name = 'wechat_access_token';

  return new Promise((resolve, reject) => {
    redisClient.get(name, (error, reply) => {
      if (error) {
        return reject(error);
      }

      if (reply && !options.updateCache) {
        logger.info('hit the cache: ');
        logger.info(reply);
        resolve(reply);
      } else {
        getAccessTokenFromWechat().then(data => {
          console.log(data);
          // Add to cache
          redisClient.set(name, data.access_token, (err, ret) => {
            if (err) {
              logger.info('error: ');
              logger.info(err);
            } else {
              logger.info('added to the cache: ');
            }
          });
          // Set redis expire time as 1min less than actual access token expire time
          redisClient.expire(name, data.expires_in - 60);

          logger.info(`--- At ${startedAt} getAccessTokenFromWechat / access_token: ${data.access_token}`);
          resolve(data.access_token);
        }, err => reject(err));
      }
    });
  });
};

module.exports.logError = logError;
module.exports.getAccessTokenFromCache = getAccessTokenFromCache;
module.exports.getUserTaskData = getUserTaskData;
module.exports.queryTodayUserMoney = queryTodayUserMoney;
module.exports.sendModelMessage = sendModelMessage;