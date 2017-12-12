'use strict';

const chai = require('chai'),
  should = chai.should(),
  Datetime = require('../../lib/datetime'),
  wechatPay = require('../../lib/wechat_pay.js'),
  child_process = require('child_process'),
  //test_pay = require('../test_luckymoney.js'),
  logger = require('../../lib/logger.js'),
  path = require('path');

describe('--test WechatPay library--', () => {
  it('send pomz007 1 yuan ', () => {
    logger.log("use `node ../../test_luckmoney.js`")
    //var _data = {
    //    "re_openid": 'oslYRxAmiWdvmXHs3p11gTJS0RC4', //POMZ007's openid
    //    "total_amount": 100 //cent
    //  },
    //  _callback = ret => {
    //    console.log("returned:", ret);
    //  };
    //
    //wechatPay.sendMoney(_data, _callback);
    const _path = path.resolve(`${__filename}/../../test_luckymoney.js`)
    child_process.execSync(`node ${_path}`)

  });
});




