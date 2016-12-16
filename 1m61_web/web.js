'use strict';

const express = require('express'),
   _ = require('underscore'),
  wechat_pay =require('../lib/wechat_pay');
let app = express();

app.get('/pay', function (req, res,next) {
  res.render('wechat_pay',{sent:false,re_openid:'',total_amount:''});
  next();
});

app.post('/pay', function (req, res,next) {
  let openid=req.param("openid"),
    money = Number(req.param("money")),

  _data = {
    "re_openid":openid,
    "total_amount":money*100,//分;
  };

  wechat_pay.sendMoney(_data, (result)=>{
    console.log(result, 'xxxxx');
    res.render('wechat_pay', _.extend({sent:true,result:result},_data));
  });


});


module.exports.app =app;
