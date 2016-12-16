'use strict';

const nr = require('newrelic'),
      express = require('express'),
      path = require('path'),
      favicon = require('serve-favicon'),
      cookieParser = require('cookie-parser'),
      bodyParser = require('body-parser'),
      xmlParser = require('express-xml-bodyparser'),
      morgan = require('morgan'),
      jwt = require('express-jwt'),
      _ = require('underscore'),
      URL = require('url'),
      cors = require('cors'),
      logger = require('./lib/logger'),
      loggerFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :response-time ms - :res[content-length] ":referrer" ":user-agent"',
      web =require('./1m61_web/web'),
      request = require('request');

const _hasXMLInRequest = (req) => {
  const str = req.headers['content-type'] || '',
        regexp = /^(text\/xml|application\/([\w!#\$%&\*`\-\.\^~]+\+)?xml)$/i;

  return regexp.test(str.split(';')[0]);
};

// Set the app root path
global.APP_ROOT = path.resolve(__dirname);
global.APP_ENV = process.env.NODE_ENV || 'development';

var Errors = require('./lib/errors');
var BadRequestError = require('./lib/errors/BadRequestError');
var NotFoundError = require('./lib/errors/NotFoundError');
var UnauthorizedError = require('./lib/errors/UnauthorizedError');

var config = require(`./config/${global.APP_ENV}.json`);
var jwtCheck = jwt({
  secret: config.appSecret
});

var app = express();
var apiApp = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(morgan(loggerFormat, {stream: {
  write(message, encoding) {
    logger.info(message);
  }
}}));

// Fix the Content-Type for sns message
// to parse the request body properly
app.use((req, res, next) => {
  if (req.headers['x-amz-sns-message-type']) {
    req.headers['content-type'] = 'application/json;charset=UTF-8';
  }
  next();
});

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());

const apiRoutesV1 = require('./routes/api/v1/index');

/**
 * Check 'x-ailingual-key' in the headers in every routes in the apiApp
 * The public key is used to identifies the request came from the trusted client
 */
apiApp.use(function(req, res, next) {
  if (req.headers['x-ailingual-key'] === config.appPublicKey || _hasXMLInRequest(req) || req.query.signature) {
    next();
  } else {
    let err = new UnauthorizedError('401', {message: 'invalid x-ailingual-key'});

    return res.status(err.status).json({
      errors: [err.inner]
    });
  }
});

/**
 * Check 'authorization' in the headers for the JWT token
 * in every routes in the apiApp except /api/v1/login path
 * The JWT token is used to identify whether the client is authorized
 */
apiApp.use(jwtCheck.unless({
  path: [
    '/api/v1/medium/upload_srt',
    '/api/wechat_messages',
    '/api/aliyun_sts'
  ],
  custom: function(req) {
    let paths = [
          // nothing for now
        ],
        url = URL.parse(req.originalUrl);

    return paths.some(function(p) {
      return (typeof p[0] === 'string' ? url.pathname === p[0] : url.pathname.match(p[0])) && req.method === p[1]
    });
  },
}));
apiApp.use('/v1', apiRoutesV1);

const wechatAPICtrl = require('./controllers/wechat'),
      stsAPICtrl = require('./controllers/aliyun_sts');

apiApp.post('/wechat_messages', xmlParser({trim: false, explicitArray: false}), wechatAPICtrl.postCtrl);
apiApp.get('/wechat_messages', wechatAPICtrl.getCtrl);
apiApp.get('/aliyun_sts', stsAPICtrl.ctrl);

// apiApp.post('/wechat_messages', xmlParser({trim: false, explicitArray: false}), (req, res) => {
//   const xml = require('xml'),
//         obj = {
//           xml: [
//             {ToUserName:  {_cdata: 'tousername'}},
//             {FromUserName:  {_cdata: 'fromusername'}},
//             {MsgType:  {_cdata: 'image'}},
//             {Image: [{
//               MediaId: {_cdata: '1111'}
//             }]}
//           ]
//         };
//   res.set('Content-Type', 'text/xml');
//   res.send(xml(obj, true));
// });

// App 17584 stdout: { xml:
// App 17584 stdout:    { url: 'http://xiaobandeng-service-staging.palmdrive.cn/api/wechat_messages',
// App 17584 stdout:      tousername: 'yujun_wu',
// App 17584 stdout:      fromusername: '1111111',
// App 17584 stdout:      createtime: '1471339944704',
// App 17584 stdout:      msgtype: 'text',
// App 17584 stdout:      content: 'helloworld',
// App 17584 stdout:      msgid: '1' } }


// Amount the apiApp
app.use('/api', apiApp);

app.use('/web',web.app);

// error handler for all the application
app.use(function(err, req, res, next) {
  console.log("Catching error: ", err);

  let code = 400,
      msg = { message: 'Internal Server Error' },
      errors;

  if (!Errors.isDefined(err)) {
    err = new BadRequestError('400', err);
  }

  if (err.name) {
    code = err.status;
    //msg = err.inner || { message: err.message };
    msg = { message: err.message };
  }

  errors = [msg];

  // Handle SequelizeUniqueConstraintError
  if (err.inner && err.inner.name === 'SequelizeUniqueConstraintError') {
    errors = err.inner.errors;
  }

  logger.info('error message: ');
  logger.info(errors[0].message);

  return res.status(code).json({
    errors: errors
  });
});

module.exports = app;
