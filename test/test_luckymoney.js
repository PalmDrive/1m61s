var common = require('../lib/wechat_pay.js');
var path = require("path")


var _data = {
    "re_openid":'oslYRxAmiWdvmXHs3p11gTJS0RC4',
    "total_amount":1000
  },
  _callback = ret => {
    console.log("return:",ret);
  };

common.fnSendMoney(_data,_callback);
