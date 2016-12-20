'use strict';
const xmlreader = require('xmlreader'),
  fs = require('fs'),
  https = require('https'),
  MD5 = require('blueimp-md5'),
  path = require("path"),
  leanCloud = require("./lean_cloud"),
  serverConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).redpacket,
  logger = require('../lib/logger');

const createXml = (json) => {

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
const createUrlParam = (json) => {

  let keys = Object.keys(json);
  keys = keys.sort();
  const _arr = keys.map(key => `${key}=${json[key]}`);
  return _arr.join('&');
};


/*
 生成微信红包xml
 api doc: https://pay.weixin.qq.com/wiki/doc/api/tools/cash_coupon.php?chapter=13_4&index=3
 varify sign: https://pay.weixin.qq.com/wiki/tools/signverify/
 */
const getRedPacketPostXml = option => {

  const _option = option || {};
  let _max_value = _option.max_value || 100, //红包最大金额
    _total_amount = _option.total_amount || 100.0, //红包总金额(分)
    _re_openid = _option.re_openid,
    _total_num = _option.total_num || 1; //红包个数

  logger.info(`给 ${_re_openid}发红包:${_total_num}个，金额:${_total_amount}分`);

  const _showName = serverConfig.showName,
    _clientIp = serverConfig.clientIp,
    _wishing = serverConfig.luckyMoneyWishing,
    _mch_id = serverConfig.mch_id,
    _wxkey = serverConfig.wxkey,
    _wxappid = serverConfig.wxappid,
    _muc_id = _mch_id;//商户id

  const _contentJson = {};

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

  const _contentStr = createUrlParam(_contentJson);

  const contentStr = _contentStr + '&key=' + _wxkey;

  _contentJson.sign = MD5(contentStr).toUpperCase();

  const _xmlData = createXml(_contentJson);
  const _sendData = '<xml>' + _xmlData + '</xml>';

  return _sendData;
};

const sendMoney = (data, callback) => {

  const _host = 'api.mch.weixin.qq.com',
    _path = '/mmpaymkttransfers/sendredpack',
    LeanCloud = leanCloud.AV,
    WeChatPayLog = LeanCloud.Object.extend('WeChatPayLog'),
    opt = {
      host: _host,
      port: '443',
      method: 'POST',
      path: _path,
      key: fs.readFileSync(path.resolve(__dirname, '../config/apiclient_key.pem')), //将微信生成的证书放入 cert目录下
      cert: fs.readFileSync(path.resolve(__dirname, '../config/apiclient_cert.pem'))
    };

  let body = '',
    log = new WeChatPayLog();
  log.set("create_time", new Date());
  log.set("money", data.re_openid);
  log.set("total_amount",String(data.total_amount/100));
  log.save();

  opt.agent = new https.Agent(opt);
  const wechatReq = https.request(opt, res => {
    logger.info("Got response: " + res.statusCode);
    res.on('data', d => {
      body += d;
    }).on('end', () => {
      //logger.info(res.headers);
      logger.info('-------received-------------');
      logger.info(body);
      logger.info('--------------------');

      log.set("result", "success");
      log.set("returned", body);
      log.save();

      parseReceivedXML(body, callback);

    });
  }).on('error', e => {
    logger.info("Got error: " + e.message);
    log.set("result", "fail");
    log.set("error", e.message);

    log.save();
  });

  const _sendData = getRedPacketPostXml(data);
  logger.info('-------send-------------');
  logger.info(_sendData);
  logger.info('--------------------');
  wechatReq.write(_sendData);
  wechatReq.end();

};

/*
 解析微信传回来得消息
 */
const parseReceivedXML = (xmlData, callback) => {

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

        if (typeof(callback) === 'function') {
          callback(response.xml)
        }
      } else {
        logger.info("pay fail...");
        if (typeof(callback) === 'function') {
          callback(response.xml)
        }
      }
    }
    return false;
  });

};

exports.sendMoney = sendMoney;

