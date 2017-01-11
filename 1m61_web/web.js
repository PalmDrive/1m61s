'use strict';

const express = require('express'),
      _ = require('underscore'),
      wechat_pay = require('../lib/wechat_pay'),
      wechat = require('../lib/wechat'),
      leanCloud = require('../lib/lean_cloud'),
      LeanCloud = leanCloud.AV;

let  openId = 'oXrsBvysdE-0o1OjinJxaPmAPy_8',
      date1 = new Date('2016/12/28'),
      date2 = new Date('2016/12/29');

let app = express();

app.get('/pay', function (req, res, next) {
  res.render('wechat_pay', { sent: false, re_openid: '', total_amount: ''} );
  next();
});

app.post('/pay', function(req, res, next) {
  let openid = req.param('openid'),
      money = Number(Number(req.param('money')).toFixed(3)),
      _data = {
        re_openid: openid,
        total_amount: money*100,//分;
      };

  wechat_pay.sendMoney(_data, (result) => {
    console.log(result, 'xxxxx');
    res.render('wechat_pay', _.extend( { sent: true, result: result }, _data));
  });
});

app.get('/detailTask', function (req, res, next) {
  // 测试数据
  // const content = [{title:'一',color:'1'},{title:'个'},{title:'测'},{title:'一',color:'1'},{title:'个',color:'0'},{title:'测'}],
  //       data = {
  //         errorTask: [
  //           {
  //             content1: content,//'一个测试片段，逗号之后的另一段',
  //             content2: content,
  //             wrongWordsAmount: '8',
  //             audioURL: 'http://ailingual-production.oss-cn-shanghai.aliyuncs.com/media_fragments/bb893acd-a15c-4eac-b928-7477b977df56/pchunk-00000109.wav'
  //           },
  //           {
  //             content1: content,
  //             content2: content,
  //             wrongWordsAmount: '2',
  //             audioURL: 'http://ailingual-production.oss-cn-shanghai.aliyuncs.com/media_fragments/bb893acd-a15c-4eac-b928-7477b977df56/pchunk-00000109.wav'
  //           }
  //         ],
  //         reward: '9元',
  //         rewardRate: '80%'
  //       };

  // res.render('detailTask',{data: data, date: '2016/12/09'});
  // next();

  date1 = new Date(req.query['date1']);
  date2 = new Date(req.query['date2']);
  openId = req.query['openId'];
  wechat.getUserTaskData(openId, date1, date2).then(data => {
    res.render('detailTask',{data});
    next();
  }).catch(Exception => {
     console.log('Exception:' + JSON.stringify(Exception));
  });
  
});

app.get('/rules', function (req, res, next) {
  res.render('rules', {} );
  next();
});

app.get('/ranking', function (req, res, next) {

  const promiseArray = [],
      data = {},
      ranking = {};

  const rightRatePromise = promiseQuery('right_task_rate').then(results => {
    results = results.map(res => {
      const r = res.toJSON();
      r.right_task_rate = r.right_task_rate * 100;
      r.reward_rate = r.reward_rate * 100;
      return r;
    });
    data.rightRateList = results.splice(0,10);
  });

  const todayTaskPromise = promiseQuery('task_amount').then(results => {
    for (var i = 0; i < results.length; i++) {
      const res = results[i].toJSON();
      res.reward_rate = res.reward_rate * 100;
      results[i] = res;
      if(res.open_id === openId) {
        data.ranking = i + 1;
        data.task_amount = res.task_amount;
        data.total_task_amount = res.total_task_amount;
        data.rewardRate = res.reward_rate;
        data.reward = (res.salary * res.reward_rate / 100).toFixed(2);
        break;
      }
    }
    data.todayTaskList = results.splice(0,10);
    // console.log('todayTaskList: ' + JSON.stringify( data.totalTaskList));
  });

  const totalTaskPromise = promiseQuery('total_task_amount').then(results => {
    results = results.map(res => {return res.toJSON();});
    data.totalTaskList = results.splice(0,10);
  });

  promiseArray.push(rightRatePromise);
  promiseArray.push(todayTaskPromise);
  promiseArray.push(totalTaskPromise);

  Promise.all(promiseArray).then(results => {
    res.render('ranking', {data} );
    next();
  });
});

const promiseQuery = (ranking) => {
  const query = new LeanCloud.Query('WeChatUser');
  query.greaterThanOrEqualTo('updatedAt', date1);
  query.lessThanOrEqualTo('updatedAt', date2);
  query.descending(ranking);
  // query.limit(10);
  return query.find().then(function(results) {
    return results;
  });
};

module.exports.app = app;
