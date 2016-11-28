var common = require('../lib/wechat_pay.js');
var path = require("path")


var _data = {},
  _callback = function(ret){
    console.log(ret)
  };

common.fnSendMoney(_data,_callback);
