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
  const q1 = new LeanCloud.Query("WeChatUser");
  q1.equalTo('role', 'A');
  const q2 = new LeanCloud.Query("WeChatUser");
  q2.equalTo('role', '帮主');
  const query = LeanCloud.Query.or(q1, q2);
  query.limit(1000);
  return query.find().then(results => {
    let shouldSendMoney = [];
    const promiseArray = results.map(user => {
      const openId = user.get('open_id');
      return getUserTaskData(openId, date1, date2, user).then(data => {
        if (data.totalTaskAmount >= 1) {
          shouldSendMoney.push(data);
        } 
      });
    });
    return Promise.all(promiseArray).then(() => {
      return shouldSendMoney;
    });
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
          
          const content2 = resultsUserTranscript1.get('content');
          logger.info(`content2: ${content2}`);

          // 计算错字
          const wordsCurrent = compare.getTotalWords(content1.replace(/xx/gi, '')),
                wordsOri = compare.getTotalWords(content2.replace(/xx/gi, '')),
                wordsDiff = compare.diffWords(wordsOri, wordsCurrent);
          xxWordsAmount += wordsCurrent.length;// 总字数
          if (wordsDiff >= 1) {
            xxWrongWordsAmount += wordsDiff;//错字数量
            xxWrongTaskAmount += 1; // 错的任务数量
          }
          errorTask.push({
            content1, content2, wrongWordsAmount: wordsDiff, 
            audioURL: resultsUserTranscript1.get('fragment_src')
          });
          return xxWordsAmount; // Can return anything
        });
      });
    });

    return Promise.all(promiseArray);
  });

  return Promise.all([totalTaskAmountPromise, xxTasksPromise]).then(results => {
    if (!user) {
      return errorTask;
    }
    const wrongWordsRate = xxWrongWordsAmount / xxWordsAmount,
          wrongTaskRate = xxWrongTaskAmount / xxTaskAmount,
          todayMoney = totalTaskAmount * (1 - wrongTaskRate) * 0.125; // 应发的钱数
    // 计算错字率
    let wrongWordsRateList = user.get('wrong_words_rate') || [];
    if (wrongWordsRate > 0.005) { 
      wrongWordsRateList.push(wrongWordsRate);
      if (wrongWordsRateList.length === 3) {
        // user.set('role', 'C');
        wrongWordsRateList = [];
      }
    } else {
      wrongWordsRateList = [];
    }
    user.set('wrong_words_rate', wrongWordsRateList);
    return user.save().then(user => {
      return {touser: openId, money: todayMoney, xxTaskAmount, totalTaskAmount, xxWrongTaskAmount, date1, date2};
    });
  });
};

// 发送模板消息
const sendModelMessage = (data, accessToken) => {
  logger.info(`sendModelMessage-- data:${JSON.stringify(data)}`);
  request.post({
    url: `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
    json: true,
    body:  {
      touser: data.touser,
      template_id: wechatConfig.templateId.completeTask,
      url: `${domainString}/web/detailTask?openId=${data.touser}&date1=${data.date1}&date2=${data.date2}`,
      data: {
        first: {
          value: `Biu~你今天赚取到${data.money}元红包[测试]：`,
          color: '#173177'
        },
        keynote1: {
          value: '任务反馈',
          color: '#173177'
        },
        keynote2: {
          value: `${data.money}元红包`,
          color: '#173177'
        },
        remark: {
          value: `下面是详细任务情况：\n 总片段数：${data.totalTaskAmount} \n 抽查片段数：${data.xxTaskAmount} \n  错误片段数：${data.xxWrongTaskAmount} \n\n 点击查看详情`,
          // \n 错误最多的类型是：${data.error[0].type}(${data.error[0].amount}个) \n\n 点击查看详情
          color: '#000000'
        }
      }
    }
  }, (error, response, body) => {
    if (error) return logError('sendModelMessage--err: ', error);
    logger.info(`sendModelMessage--response: ${JSON.stringify(response)}`);
    logger.info(`sendModelMessage--body: ${JSON.stringify(body)}`);
  });
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