'use strict';

const express = require('express'),
      _ = require('underscore'),
      wechat_pay = require('../lib/wechat_pay'),
      wechat = require('../controllers/wechat');

let app = express();

app.get('/pay', function (req, res, next) {
  res.render('wechat_pay', { sent: false, re_openid: '', total_amount: ''} );
  next();
});

app.post('/pay', function(req, res, next) {
  let openid = req.param('openid'),
      money = Number(req.param('money')),
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
  // const data = {
  //         touser: '',
  //         money: '100',
  //         totalAmount: '25',
  //         errorAmount: '3',
  //         todayDateString: '2016/12/19',
  //         errorTask: [
  //           {
  //             content1: '一个测试片段，逗号之后的另一段',
  //             content2: '一个好的测试片段',
  //             wrongWordsAmount: '8',
  //             audioURL: 'http://ailingual-production.oss-cn-shanghai.aliyuncs.com/media_fragments/bb893acd-a15c-4eac-b928-7477b977df56/pchunk-00000109.wav'
  //           },
  //           {
  //             content1: '一个测试片段，逗号',
  //             content2: '一个好的测试片段',
  //             wrongWordsAmount: '2',
  //             audioURL: 'http://ailingual-production.oss-cn-shanghai.aliyuncs.com/media_fragments/bb893acd-a15c-4eac-b928-7477b977df56/pchunk-00000109.wav'
  //           }
  //         ]
  //       };

  // res.render('detailTask',{data: data, date: '2016/12/09'});
  wechatgetUserTaskData(req.query('openId'),   req.query('date1'), req.query('date2')).then(data => {
    res.render('detailTask',{data: data, date: req.query('date2').toLocaleDateString()});
  });
  
  next();
});

module.exports.app =app;
