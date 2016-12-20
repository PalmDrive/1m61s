const wechat_pay = require('../lib/wechat_pay.js');
const path = require("path")


const _data = {
    "re_openid":'oslYRxAmiWdvmXHs3p11gTJS0RC4',
    "total_amount":1
  },
  _callback = ret => {
  };

wechat_pay.sendMoney(_data,_callback);
