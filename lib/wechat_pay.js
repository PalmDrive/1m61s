const xmlreader = require('xmlreader'),
  fs = require('fs'),
  https = require('https'),
  MD5 = require('blueimp-md5'),
  path = require("path"),
  serverConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).redpacket,
  logger = require('../lib/logger');

const fnCreateXml = (json) => {
  "use strict";
  let _xml = '';
  for (let key in json) {
    //_xml += '<' + key + '><![CDATA[' + json[key] + ']]></' + key + '>';
    _xml += '<' + key + '>' + json[key] + '</' + key + '>';
  }
  return _xml;
};

/*
 生成url串用于微信md5校验
 */
const fnCreateUrlParam = (json) => {
  "use strict";
  let _arr = [];
  let keys = Object.keys(json);
  keys = keys.sort();

  for (let i = 0; i < keys.length; i++) {
    let key = keys[i]
    _arr.push(key + '=' + json[key]);
  }
  return _arr.join('&');
};


/*
 生成微信红包xml
 api doc: https://pay.weixin.qq.com/wiki/doc/api/tools/cash_coupon.php?chapter=13_4&index=3
 varify sign: https://pay.weixin.qq.com/wiki/tools/signverify/
 */
const fnGetWeixinBonus = option => {
  "use strict";
  let _option = option || {};
  let _max_value = _option.max_value || 100, //红包最大金额
    _total_amount = _option.total_amount || 100.0, //红包总金额(分)
    _re_openid = _option.re_openid || 'oslYRxAmiWdvmXHs3p11gTJS0RC4', //红包发送的目标用户 pomz007
    _total_num = _option.total_num || 1; //红包个数

  logger.info(`给 ${_re_openid}发红包:${_total_num}个，金额:${_total_amount}分`);

  let _showName = serverConfig.showName;
  let _clientIp = serverConfig.clientIp;
  let _wishing = serverConfig.luckyMoneyWishing;
  let _mch_id = serverConfig.mch_id;
  let _wxappid = serverConfig.wxappid,
    _wxkey = serverConfig.wxkey;

  let _muc_id = _mch_id;//商户id
  let _contentJson = {};
  _contentJson.nonce_str = '123456';
  ////订单号 一天内不能重复的数字;
  _contentJson.mch_billno = `${_mch_id}000${new Date().getTime()}`;

  _contentJson.mch_id = _muc_id;
  _contentJson.wxappid = _wxappid;
  _contentJson.send_name = _showName;
  _contentJson.re_openid = _re_openid;
  _contentJson.total_amount = _total_amount;
  _contentJson.total_num = _total_num;
  _contentJson.wishing = _wishing;
  _contentJson.client_ip = _clientIp;
  _contentJson.act_name = _showName;
  _contentJson.remark = _wishing;

  let _contentStr = fnCreateUrlParam(_contentJson);

  let contentStr = _contentStr + '&key=' + _wxkey;

  _contentJson.sign = MD5(contentStr).toUpperCase();

  let _xmlData = fnCreateXml(_contentJson);
  let _sendData = '<xml>' + _xmlData + '</xml>';
  return _sendData;
};

const fnSendMoney = (data, callback) => {
  "use strict";
  let _host = 'api.mch.weixin.qq.com';
  let _path = '/mmpaymkttransfers/sendredpack';

  let opt = {
    host: _host,
    port: '443',
    method: 'POST',
    path: _path,
    key: fs.readFileSync(path.resolve(__dirname, '../config/apiclient_key.pem')), //将微信生成的证书放入 cert目录下
    cert: fs.readFileSync(path.resolve(__dirname, '../config/apiclient_cert.pem'))
  };

  let body = '';
  opt.agent = new https.Agent(opt);
  let wechat_req = https.request(opt, function (res) {
    logger.info("Got response: " + res.statusCode);
    res.on('data', function (d) {
      body += d;
    }).on('end', function () {
      //logger.info(res.headers);
      logger.info('-------received-------------');
      logger.info(body);
      logger.info('--------------------');

      if (typeof callback == 'function') {
        fnParseReceivedXML(body, callback);
      }

    });
  }).on('error', function (e) {
    logger.info("Got error: " + e.message);
  });


  let _sendData = fnGetWeixinBonus(data);
  logger.info('-------send-------------');
  logger.info(_sendData);
  logger.info('--------------------');
  wechat_req.write(_sendData);
  wechat_req.end();
};

/*
 解析微信传回来得消息
 */
const fnParseReceivedXML = (xmlData, callback) => {
  "use strict";
  xmlreader.read(xmlData, (errors, response) => {
    if (null !== errors) {
      logger.info(errors);
      return;
    }
    if (response && response.xml && response.xml.return_code) {
      logger.info("return_code:", response.xml.return_code.text());
      logger.info("result code:", response.xml.result_code.text());

      if (response.xml.result_code.text() === 'SUCCESS') {
        logger.info("pay success...");
        callback(true)
      } else {
        logger.info("pay fail...");
        callback(false)
      }
    }
    return false;
  });

};

exports.fnSendMoney = fnSendMoney;

