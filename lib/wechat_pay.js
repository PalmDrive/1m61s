const payAPIAddr = 'https://api.mch.weixin.qq.com/mmpaymkttransfers/sendredpack';


//module.exports.toWeChatUser = (openId, amount) => {
//
//};

const xmlreader = require('xmlreader');
const fs = require('fs');
const https = require('https');
const MD5 = require('blueimp-md5');
const path = require("path");
const serverConfig = require(path.resolve(__dirname, '../config/pay_config.json'));


const fnCreateXml = (json) => {
  "use strict"
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
  "use strict"
  let _arr = [];
  for (let key in json) {
    _arr.push(key + '=' + json[key]);
    console.log('key:', key, 'val:', json[key])
  }
  return _arr.join('&');
};


/*
 生成微信红包数据
 */
const fnGetWeixinBonus = option => {
  "use strict"
  let _option = option || {};
  let _min_value = _option.min_value || 0.01, //红包最小金额
    _max_value = _option.max_value || 100, //红包最大金额
    _total_amount = _option.total_amount || 1000, //红包总金额
  //_re_openid = _option.re_openid || 'omNdNuCzOuYOm5aBr1-B5hhUS1JI', //红包发送的目标用户
    _re_openid = _option.re_openid || 'oslYRxAmiWdvmXHs3p11gTJS0RC4', //红包发送的目标用户
    _total_num = _option.total_num || 1; //红包个数

  let _now = new Date();
  let _showName = serverConfig.showName;
  let _clientIp = serverConfig.clientIp;
  let _wishing = serverConfig.luckyMoneyWishing;
  let _mch_id = serverConfig.mch_id;
  let _wxappid = serverConfig.wxappid,
    _wxkey = serverConfig.wxkey;

  let _date_time = _now.getFullYear() + '' + (_now.getMonth() + 1) + '' + _now.getDate();
  let _date_no = (_now.getTime() + '').substr(-8); //生成8为日期数据，精确到毫秒
  let _random_no = Math.floor(Math.random() * 99);
  if (_random_no < 10) { //生成位数为2的随机码
    _random_no = '0' + _random_no;
  }
  let _muc_id = _mch_id;//'1230184802';
  let _xmlTemplate = '<xml>{content}</xml>';
  let _contentJson = {};
  _contentJson.act_name = _showName;// '新年红包';
  _contentJson.client_ip = _clientIp;

  //_contentJson.mch_billno = _muc_id + _date_time + _date_no + _random_no; //订单号为 mch_id + yyyymmdd+10位一天内不能重复的数字; //+201502041234567893';
  _contentJson.mch_billno = "1234567891"; //订单号为 mch_id + yyyymmdd+10位一天内不能重复的数字; //+201502041234567893';
  _contentJson.mch_id = _muc_id;
  _contentJson.nick_name = _showName;
  _contentJson.nonce_str = '123456';
  _contentJson.re_openid = _re_openid;
  _contentJson.remark = _wishing;
  _contentJson.send_name = _showName;//
  _contentJson.total_amount = _total_amount;// '100';
  _contentJson.total_num = _total_num;//1;
  _contentJson.wishing = _wishing;//'恭喜发财';
  _contentJson.wxappid = _wxappid;// 'wxbfca079a0b9058d3';

  let _contentStr = fnCreateUrlParam(_contentJson);
  //_contentJson.key = _wxkey;

  let contentStr = _contentStr + '&key=' + _wxkey;
  console.log('content\n' + contentStr);

  _contentJson.sign = MD5(contentStr).toUpperCase().trimLeft();

  console.log('md5:\n', _contentJson.sign, '\n')
  //删除 key (key不参与签名)
  //delete _contentJson.key;
  let _xmlData = fnCreateXml(_contentJson);

  let _sendData = '<xml>' + _xmlData + '</xml>'; //_xmlTemplate.replace(/{content}/)

  console.log('xml:\n' + _sendData);

  return _sendData;
};

const fnSendMoney = (req, res, data, callback) => {
  "use strict"
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
    console.log("Got response: " + res.statusCode);
    res.on('data', function (d) {
      body += d;
    }).on('end', function () {
      //console.log(res.headers);
      console.log('--------------------');
      console.log(body);
      let ret = fnParseReceivedXML(body);
      //如果回调存在就执行回调函数
      if (typeof callback == 'function') {
        callback(ret);
      }
    });
  }).on('error', function (e) {
    console.log("Got error: " + e.message);
  });


  let _sendData = fnGetWeixinBonus({});
  wechat_req.write(_sendData);
  wechat_req.end();
};

/*
 解析微信传回来得消息
 */
const fnParseReceivedXML = function (xmlData) {
  "use strict"
  try {
    xmlreader.read(xmlData, function (errors, response) {
      if (null !== errors) {
        console.log(errors);
        return;
      }
      // console.log( response.xml );
      if (response && response.xml && response.xml.return_code) {
        if ((response.xml.return_code.text() || '').toLowerCase() == 'sucess') {
          return true;
        }
        return false;
      }
      return false;
    });
  } catch (e) {
    console.log('weixin sendmoney error' + e.message);
  }
};

exports.fnSendMoney = fnSendMoney;

