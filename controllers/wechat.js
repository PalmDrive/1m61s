'use strict';

const request = require('request'),
      exec = require('child_process').exec,
      fs = require('fs'),
      leanCloud = require('../lib/lean_cloud'),
      UserTranscript = leanCloud.AV.Object.extend('UserTranscript'),
      CrowdsourcingTask = leanCloud.AV.Object.extend('CrowdsourcingTask'),
      xml = require('xml'),
      datetime = require('../lib/datetime'),
      logger = require('../lib/logger'),
      wechatConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).wechat,
      gaConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).ga,
      redisClient = require('../redis_client');

const taskTimers = {};

const getTime = (startedAt) => {
  return (new Date() - startedAt) + ' ms';
};

const calculateWrongWords = () => {
  let query = new leanCloud.AV.Query('WeChatUser');
  query.find(results => {
    debugger;
  });
};

const sendModelMessage = (incomingData, accessToken) => {
  logger.info('sendModelMessage-- start');
  const data = {
          touser: incomingData.fromusername,
          money: '100',
          totalAmount: '25',
          errorAmount: '3',
          error: [
            {
              type: '首字母大写',
              amount: '5'
            },
            {
              type: '缺漏词语',
              amount: '2'
            }
          ]
        };

  logger.info(`sendModelMessage-- data:${JSON.stringify(data)}`);
  request.post({
    url: `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
    json: true,
    body:  {
      touser: data.touser,
      template_id: wechatConfig.templateId.completeTask,
      url: 'http://weixin.qq.com/download',
      data: {
        first: {
          value: `Biu~你今天赚取到${data.money}元红包[测试]：`,
          color: '#173177'
        },
        keynote1: {
          value: '任务反馈',
          color: '#173177'
        },
        keynote2: {
          value: `${data.money}元红包`,
          color: '#173177'
        },
        remark: {
          value: `下面是详细任务情况：\n 总片段数：${data.totalAmount} \n 错误片段数：${data.errorAmount} \n 错误最多的类型是：${data.error[0].type}(${data.error[0].amount}个) \n\n 点击查看详情`,
          color: '#000000'
        }
      }
    }
  }, (error, response, body) => {
    if (error) return logError('sendModelMessage--err: ', error);
    logger.info(`sendModelMessage--response: ${JSON.stringify(response)}`);
    logger.info(`sendModelMessage--body: ${JSON.stringify(body)}`);
  });
};

const savedContent = {};
savedContent.firstMin = [
  '我今天演讲猪蹄是努力把最简单的事情做到最好，剩下的就是坚持，我会大概回顾一下KEEP在过去二十个月成长的点点滴滴，也跟大家做一个分享和交流，',
  '知道今天非常冷！我来之前说，这个现场可能这个来的人也会比多，因为大家在这么早的时间就可以来到这里好听分享和交流，也许还有一些人还没有完全打开睡眼，',
  '她老说你是不是可以带大家一起跳一个健身操啊，我说这个健身操有一点点难，但是我还是希望可以带着大家做一些简单的简单的小的放松，我们先来一场这个身体的奇幻旅程却在可以发现，',
  '每个人的身体是非常有趣的一件事情，可能通过一些简单的变化，只说一种一种心理和生理上变化，你就会觉得你的身体会发生很多奇妙的变化，如果大家现在方便的话可以一起的，做几个简单的动作好吗？'
];
savedContent.secondMin = [
  {
    q: '第1题：他 v.s 她 v.s 它\n你收到的文字都是机器转移的，机器一般会默认写“他”，但大部分其实是“它”，比如公司名呀、商业模式呀等等，大家一定要留意一下。\n\n问：如果语音里是公司名，你收到对应的文字是“他”，那么，你是否需要修改这个字？\n1. 需要\n2. 不需要\n\n回复数字“1” 或“2” 即可。',
    a: '1'
  },
  {
    q: '第2题：的 v.s 得 v.s 地\n-“的”前面接的是形容词或者名词，是形容名词的；\n-“地”前面是副词，是形容动作哒；\n-“得”…大家自行脑补…\n\n问：“小明今天很开心的完成了作业！”这句话中“的”是否正确？\n1. 正确\n2. 错误',
    a: '2'
  },
  {
    q: '第3题：英文单词首字母要大写\n比如：stanford要写成Stanford，student要写成Student\n\n问：“uber”这种英文写法是正确还是错误？\n1. 正确\n2. 错误',
    a: '2'
  },
  {
    q: '第4题：语气词、没有实际意义的口语、重复的话可以自行删减\n比如：主讲人会“…这个…那个…哈…”等\n\n问：“啊，这个，这个，这个…我今天的演讲主题是…”其中“这个”是否应该去掉？\n1. 去掉\n2. 不去掉',
    a: '1'
  },
  {
    q: '第5题： 加标点\n机器加标点很傻瓜的，大家可以根据语意给文字加标点噢，特别是句子的开头或者结尾，标点一定要慎重，如果不是一句完整的句子就千万不要加标点啦！！\n\n问：“在一段文字最后加标点”这句话是正确还是错误？\n1. 正确\n2. 错误\n3. 看情况，有时候正确，有时候错误',
    a: '3'
  },
  {
    q: '第6题： 规则\n任何时候当你想不起来一个具体情况该如何处理时，回复“规则”就能蹦出来所有文字修改规则啦（同时修改规则在不断更新噢~）\n\n问：当你不知道一个具体情况该如何处理时，回复什么?',
    a: '规则'
  }
];
savedContent.thirdMin = [
  '首先大家不知道有没有做过，这种像这种拉伸得运动，就是用用最长用用你最大的幅度来去勾你的脚ok，等待可以看一下，并且记录一下，你现在可以触碰到的位置',
  '最高的，可以触碰到的最高的限度是多少？对，可能有得同学可以触碰到地面，但是有地同学可能这个由于韧带的问题可能并不会触碰到地面，对，ok，',
  '大家记住自己可以下呀的最大的幅度，所有人都闭上的眼睛，眼球，哦，顺时针转五圈一下用于自己眼球顺时针转五圈，',
  '当你闭上眼睛的时候，重新转五圈眼球得时候再下去，下了的时候你会发现你可以突破你之前的极限。这的一个很有意思的小的实验，第二小的实验大家所有人双脚与肩同宽，然后伸出自己的左手，'
];

const getAccessTokenFromWechat = () => {
  console.log('get access token from wechat...');
  const APPID = wechatConfig.appId,
        APPSECRET = wechatConfig.appSecret,
        url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`;
  return new Promise((resolve, reject) => {
    request({
      url,
      json: true
    }, (error, response, body) => {
      if (error) return reject(error);

      if (body.errcode) {
        reject(body);
      } else {
        resolve(body);
      }
    });
  });
};

const getAccessTokenFromCache = (options, startedAt) => {
  console.log('get access token from cache...');
  options = options || {};
  const name = 'wechat_access_token';

  return new Promise((resolve, reject) => {
    redisClient.get(name, (error, reply) => {
      if (error) {
        return reject(error);
      }

      if (reply && !options.updateCache) {
        logger.info('hit the cache: ');
        logger.info(reply);
        resolve(reply);
      } else {
        getAccessTokenFromWechat().then(data => {
          console.log(data);
          // Add to cache
          redisClient.set(name, data.access_token, (err, ret) => {
            if (err) {
              logger.info('error: ');
              logger.info(err);
            } else {
              logger.info('added to the cache: ');
            }
          });
          // Set redis expire time as 1min less than actual access token expire time
          redisClient.expire(name, data.expires_in - 60);

          logger.info(`--- At ${startedAt} getAccessTokenFromWechat / access_token: ${data.access_token}`);
          resolve(data.access_token);
        }, err => reject(err));
      }
    });
  });
};

// const createQRTicket = (scene, token) => {
//   const actionName = 'QR_SCENE',
//         expireSeconds = 604800; // 1 week

//   return new Promise((resolve, reject) => {
//     request.post({
//       url: `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${token}`,
//       json: true,
//       body: {
//         expire_seconds: expireSeconds,
//         action_name: actionName,
//         action_info: {
//           scene: {scene_id: scene.get('sceneId')}
//         }
//       }
//     }, (error, response, body) => {
//       if (error) return reject(error);

//       if (body.errcode) {
//         reject(body);
//       } else {
//         resolve(body.ticket);
//       }
//     });
//   });
// };

const uploadMedia = (mediaSrc, type, token, _startedAt) => {
  const url = `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=${type}`;

  return new Promise((resolve, reject) => {
    request.post({
      url,
      formData: {
        media: fs.createReadStream(mediaSrc)
      }
    }, (error, response, body) => {
      logger.info(`--- At ${getTime(_startedAt)} uploadMedia / url: ${url}`);
      if (error) { return reject(error); }

      const parsedBody = JSON.parse(body);

      if (parsedBody.errcode) {
        reject(parsedBody);
      } else {
        // media_id: 2_yKCffp_ChaXeleAuTMzqz7ti-UQmb8MZzPwkCmYrR9YeXf3t8DYY4XUDIdwTFH
        resolve(parsedBody);
      }
    });
  });
};

// const sendTemplateMessage = (toUser, data, templateId, token) => {
//   const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`;
//   return new Promise((resolve, reject) => {
//     request.post({
//       url,
//       json: true,
//       body: {
//         template_id: templateId,
//         touser: toUser,
//         url: '',
//         data: data
//       }
//     }, (error, response, body) => {
//       if (error) { return reject(error); }
//       if (body.errcode) {
//         reject(body);
//       } else {
//         resolve(body);
//       }
//     });
//   });
// };

/**
 * @param  {Dict} data
 * @param  {String} data.tousername 开发者微信号
 * @param  {String} data.fromusername 接收QRcode的用户OpenID
 * @param  {String} data.content 将要创建的scene的eventName
 */
// const sendQRCodeMessage = (data, token, res) => {
//   const Scene = leanCloud.AV.Object.extend('Scene'),
//         query = new leanCloud.AV.Query('Scene'),
//         scene = new Scene();

//   query.count()
//     .then(count => {
//       // Create the scene
//       scene.set('creatorId', data.fromusername);
//       scene.set('eventName', data.content);
//       scene.set('sceneId', count + 1);

//       // @fixme:
//       // temp event time
//       scene.set('eventTime', + new Date());
//       return scene.save();
//     })
//     .then(scene => {
//       // Create QR ticket
//       return createQRTicket(scene, token);
//     })
//     .then(ticket => {
//       logger.info('ticket created: ');
//       logger.info(ticket);

//       const qrURL = `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${ticket}`,
//             mediaSrc = `${global.APP_ROOT}/tmp/qr_${scene.id}.jpg`,
//             ws = fs.createWriteStream(mediaSrc);

//       ws.on('finish', () => {
//         logger.info('QR image saved in local');

//         // Upload the QR image as media in Wechat
//         uploadMedia(mediaSrc, 'image', token)
//           .then(media => {
//             logger.info('media uploaded: ');
//             logger.info(media);

//             // Delete local QR image
//             fs.unlink(mediaSrc);

//             const object = {
//               xml: [
//                 {ToUserName: {_cdata: data.fromusername}},
//                 {FromUserName: {_cdata: data.tousername}},
//                 {MsgType: {_cdata: 'image'}},
//                 {CreateTime: +new Date()},
//                 {Image: [{
//                   MediaId: {_cdata: media.media_id}
//                 }]}
//               ]
//             };

//             // Send the user the message containing the QR code
//             //
//             // <xml>
//             // <ToUserName><![CDATA[toUser]]></ToUserName>
//             // <FromUserName><![CDATA[fromUser]]></FromUserName>
//             // <CreateTime>12345678</CreateTime>
//             // <MsgType><![CDATA[image]]></MsgType>
//             // <Image>
//             // <MediaId><![CDATA[media_id]]></MediaId>
//             // </Image>
//             // </xml>
//             res.set('Content-Type', 'text/xml');
//             res.send(xml(object));
//           });
//       }, err => {
//         logger.info('upload media failed: ');
//         logger.info(err);
//       });

//       // Save the QR image to local
//       request(qrURL).pipe(ws);
//     }, err => {
//       logger.info('ticket creation failed: ');
//       logger.info(err);
//     });
// };

/**
 * @param  {Dict} data
 * @param  {String} data.tousername
 * @param  {String} data.fromusername
 * @param  {Number} data.createtime
 * @param  {String='event'} data.msgtype
 * @param  {String='subscribe', 'SCAN'} data.event
 * @param  {String} data.eventkey
 * @param  {String} data.ticket
 */
// const onQRCodeScanned = (data, token, res) => {
//   const scannerLimit = 3,
//         sceneId = data.event === 'SCAN' ? +data.eventkey : +(data.eventkey.replace('qrscene_', '')),
//         query = new leanCloud.AV.Query('Scene');

//   let scanUsers;

//   query.equalTo('sceneId', sceneId);

//   logger.info('scene id: ');
//   logger.info(sceneId);

//   // Use the scene id to get the scene
//   query.first()
//     .then(scene => {
//       scanUsers = scene.get('scanUsers') || [];

//       // If this is the first time the person scanned this QR code, add him into scanUsers
//       if (scanUsers.indexOf(data.fromusername) === -1) {
//         scanUsers.push(data.fromusername);
//         scene.set('scanUsers', scanUsers);
//         scene.save();
//       }

//       logger.info('the number of users scanned: ');
//       logger.info(scene.get('scanUsers').length)

//       if (scene.get('scanUsers').length >= scannerLimit) {
//         // Notifify the scene creator that
//         // there are enough users referred by his QR code
//         const templateId = 'RoZSvlxg6rf7JlmBXEnnsbeHnoZ6gKXHY4PJp6lk7IA',
//               templateData = {
//                 first: {value: '报名成功。'},
//                 class: {value: scene.get('eventName')},
//                 time: {value: datetime(scene.get('eventTime') || new Date(), {format: 'datetime'})},
//                 add: {value: '小板凳APP'},
//                 remark: {value: ''}
//               };

//         sendTemplateMessage(scene.get('creatorId'), templateData, templateId, token);
//       }

//       // 给扫描二维码的用户发送一个二维码
//       sendQRCodeMessage({
//         fromusername: data.fromusername,
//         tousername: data.tousername,
//         content: scene.get('eventName')
//       }, token, res);
//     });
// };

// Return the duration in seconds from ffprobe stdout
const parseDuration = stdout => {
  stdout = stdout.slice(18, 20);
  stdout = parseInt(stdout, 10);
  return stdout;
};

const sendToUser = {
  // Send a message using 客服接口
  message(body, accessToken) {
    return new Promise((resolve, reject) => {
      request.post({
        url: `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`,
        json: true,
        body
      }, (error, response, responseBody) => {

        logger.info(`--- At ${getTime(body._startedAt)} sending message to user ${body.touser}`);

        if (error) { return reject(error); }
        if (responseBody.errcode) {
          reject(responseBody);
        } else {
          resolve(responseBody);
        }
      });
    });
  },
  image(mediaId, userId, accessToken, _startedAt) {
    const body = {
            touser: userId,
            msgtype: 'image',
            image: {
              media_id: mediaId
            },
            _startedAt: _startedAt
          };
    return this.message(body, accessToken);
  },
  // Send a text message to user
  text(content, data, accessToken) {
    return this.message({
      touser: data.fromusername,
      msgtype: 'text',
      text: {content},
      _startedAt: data._startedAt
    }, accessToken);
  },
  // Send a voice message to user, if audio length > 8s, split audio into two
  voice(transcript, data, accessToken) {
    const audioURL = transcript.get('fragment_src'),
          audioId = transcript.id,
          mediaSrc = `${global.APP_ROOT}/tmp/${audioId}.mp3`,
          splitPath1 = `${global.APP_ROOT}/tmp/${audioId}_split1.mp3`,
          splitPath2 = `${global.APP_ROOT}/tmp/${audioId}_split2.mp3`,
          ws = fs.createWriteStream(mediaSrc),
          self = this,
          _startedAt = data._startedAt;

    ws.on('finish', () => {
        logger.info(`--- At ${getTime(_startedAt)} Audio saved in local`);

        exec(`ffprobe ${mediaSrc} 2>&1 | grep Duration`, (error, stdout, stderr) => {
          if (error) {
            logError(`--- At ${getTime(_startedAt)} exec error`, error);
            return;
          }
          const duration = parseDuration(stdout);
          logger.info(`--- At ${getTime(_startedAt)} Audio length in seconds:`);
          logger.info(duration);

          if (duration > 8) {
            const cutPoint = duration / 2;

            // First half fragment
            exec(`ffmpeg -f wav -i ${mediaSrc} -t ${cutPoint} ${splitPath1}`, (error, stdout, stderr) => {
              if (error) {
                logger.info(`--- At ${getTime(_startedAt)} split file 1 exec error: ${error}`);
                return;
              }
              logger.info(`--- At ${getTime(_startedAt)} Finished split file 1`);

              uploadMedia(splitPath1, 'voice', accessToken, _startedAt)
              .then(media => {
                logger.info(`--- At ${getTime(_startedAt)} split media 1 uploaded:`);
                logger.info(media);

                // Delete local audio file
                fs.unlink(splitPath1);

                // Send the voice message
                self.message({
                  touser: data.fromusername,
                  msgtype: 'voice',
                  voice: {media_id: media.media_id},
                  _startedAt
                }, accessToken).then(() => {
                  // Second half fragment
                  exec(`ffmpeg -f wav -ss ${cutPoint} -i ${mediaSrc} ${splitPath2}`, (error, stdout, stderr) => {
                    if (error) {
                      logger.info(`--- At ${getTime(_startedAt)} split file 2 exec error: ${error}`);
                      return;
                    }
                    logger.info(`--- At ${getTime(_startedAt)} Finished split file 2`);

                    uploadMedia(splitPath2, 'voice', accessToken, _startedAt)
                    .then(media => {
                      logger.info(`--- At ${getTime(_startedAt)} split media 2 uploaded:`);
                      logger.info(media);

                      // Delete local audio file
                      fs.unlink(splitPath2);
                      fs.unlink(mediaSrc);

                      // Wait 1s to send the voice message
                      setTimeout(() => {
                        self.message({
                          touser: data.fromusername,
                          msgtype: 'voice',
                          voice: {media_id: media.media_id},
                          _startedAt
                        }, accessToken);
                      }, 1000);
                    }, err => {
                      logError('upload split media 2 failed', err);
                    });
                  });
                });
              }, err => {
                logError('upload split media 1 failed', err);
              });
            });
          } else {
            // Upload the audio as media in Wechat
            uploadMedia(mediaSrc, 'voice', accessToken, _startedAt)
              .then(media => {
                logger.info(`--- At ${getTime(_startedAt)} media uploaded: `);
                logger.info(media);

                // Delete local audio file
                fs.unlink(mediaSrc);

                // Send the voice message
                return self.message({
                  touser: data.fromusername,
                  msgtype: 'voice',
                  voice: {media_id: media.media_id},
                  _startedAt
                }, accessToken);
              }, err => {
                logError('upload media failed', err);
              });
          }
        });
    }, err => {
      logError('voice message ws', err);
    });

    // Save the audio to local
    request(audioURL, (err, res, body) => {
      logger.info(`--- At ${getTime(_startedAt)} request audio URL:`);
      logger.info(audioURL);
      if (err) {
        self.text('biu~抱歉，获取语音出现问题，请回复“没有语音”，系统会为你准备新的任务。', data, accessToken);
        logError('request audio error', err);
      }
    }).pipe(ws);
  },
  // Send an uploaded voice
  voiceByMediaId(mediaId, userId, accessToken, _startedAt) {
    const body = {
            touser: userId,
            msgtype: 'voice',
            voice: {media_id: mediaId},
            _startedAt: _startedAt
          };
    return this.message(body, accessToken);
  },
  // Send a voice message without splitting audio
  singleVoice(transcript, data, accessToken) {
    const audioURL = transcript.get('fragment_src'),
          audioId = transcript.id,
          mediaSrc = `${global.APP_ROOT}/tmp/single_${audioId}.mp3`,
          ws = fs.createWriteStream(mediaSrc),
          self = this,
          _startedAt = data._startedAt;
    ws.on('finish', () => {
      logger.info(`--- At ${getTime(_startedAt)} Audio saved in local`);
      // Upload the audio as media in Wechat
      uploadMedia(mediaSrc, 'voice', accessToken, _startedAt)
        .then(media => {
          logger.info(`--- At ${getTime(_startedAt)} media uploaded:`);
          logger.info(media);

          // Delete local audio file
          fs.unlink(mediaSrc);

          // Send the voice message
          return self.message({
            touser: data.fromusername,
            msgtype: 'voice',
            voice: {media_id: media.media_id},
            _startedAt
          }, accessToken);
        }, err => {
          logError('upload media failed', err);
        });
    }, err => {
      logError('voice message ws', err);
    });

    // Save the audio to local
    request(audioURL, (err, res, body) => {
      logger.info(`--- At ${getTime(_startedAt)} request audio URL:`);
      logger.info(audioURL);
      if (err) {
        self.text('biu~抱歉，获取语音出现问题。', data, accessToken);
        logError('request audio error', err);
      }
    }).pipe(ws);
  },
  // Send voice and text to the user
  task(task, data, accessToken, user) {
    // get Transcript or UserTranscript
    const type = task.get('fragment_type'),
          fragmentId = task.get('fragment_id'),
          query = new leanCloud.AV.Query(type),
          self = this,
          _startedAt = data._startedAt;
    return query.get(fragmentId).then(transcript => {
      // This transcript can be Transcript or UserTranscript
      logger.info(`--- At ${getTime(_startedAt)} find transcript with id : ${fragmentId}`);
      if (transcript) {
        const content = type === 'Transcript' ? transcript.get('content_baidu')[0] : transcript.get('content');
        // Send text in transcript
        self.text(content, data, accessToken);
        // Send voice
        self.voice(transcript, data, accessToken);
      } else {
        // Should not get here because error occurs when query by id cannot find object
        logger.info('Did not find transcript with id: ');
        logger.info(fragmentId);
        return self.text('对不起，系统错误，请联系管理员。', data, accessToken);
      }
    }, err => {
      logError('failed getting transcript when sending task', err);
      logger.info(`--- At ${getTime(_startedAt)} error: find transcript with id : ${fragmentId}`);
      task.destroy().then(success => {
        findAndSendNewTaskForUser(data, accessToken, user);
      }, err => {
        logError('failed destroying task', err);
      });
    });
  }
};

const createUser = (userId, tasksDone) => {
  const WeChatUser = leanCloud.AV.Object.extend('WeChatUser'),
        weChatUser = new WeChatUser();
  tasksDone = tasksDone || 0;
  weChatUser.set('open_id', userId);
  weChatUser.set('tasks_done', tasksDone);
  weChatUser.set('status', -300);
  weChatUser.set('price', 0.5);
  return weChatUser.save();
};

const onSubscribe = (data, accessToken) => {
  const userId = data.fromusername;
  // Send image of introduction
  sendToUser.image(wechatConfig.mediaId.image.subscribe, userId, accessToken, data._startedAt).then(() => {
    // Send text in 1s
    setTimeout(() => {
      sendToUser.text(savedContent.firstMin[0], data, accessToken);
    }, 1000);
    // Send voice in 2s
    setTimeout(() => {
      sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe1[0], userId, accessToken, data._startedAt);
    }, 2000);
  });
};

// Assign the task to the user in database
const assignTask = (task, data, accessToken) => {
  const userId = data.fromusername;
  task.set('user_id', userId);
  return task.save().then(task => {
    logger.info(`--- At ${getTime(data._startedAt)} Assign task / task.save with userid : ${userId}`);
    // Cancel this user's last timer
    if (taskTimers[userId]) {
      clearTimeout(taskTimers[userId]);
    }
    // Set new 1-hour timer
    taskTimers[userId] = setTimeout(() => {
      const query = new leanCloud.AV.Query('CrowdsourcingTask');
      query.get(task.id).then(task => {
        logger.info(`--- At ${getTime(data._startedAt)} Assign task / query.get(task.id) with task.id : ${task.id}`);
        if (task.get('status') === 0) {
          task.unset('user_id');
          task.save().then(task => {
            logger.info(`--- At ${getTime(data._startedAt)} Assign task / Task recycled with task.id : ${task.id}`);
            sendToUser.text('biu~每次任务如果在1个小时内没有被解决掉，它就会被自动分配给其它童鞋呢，现在你的任务已经失效，如果要领取新的任务，请点击“领取任务”（每天9点发布新的任务哦）', data, accessToken);
          });
        }
      });
    }, 3600000);

    return task;
  }, err => {
    logError('assign task error', err);
  });
};

const isTaskValid = (task, _startedAt) => {
  const type = task.get('fragment_type'),
        id = task.get('fragment_id'),
        query = new leanCloud.AV.Query(type);

  return query.get(id).then(transcript => {
    logger.info(`--- At ${getTime(_startedAt)} isTaskValid / get task with fragment_id : ${id}`);
    // Check for content
    const content =  type === 'Transcript' ? transcript.get('content_baidu') : transcript.get('content');
    if (!content) {
      return false;
    }
    // Check for fragment_src
    const fragmentSrc = transcript.get('fragment_src');
    if(!fragmentSrc) {
      return false;
    }

    return true;
  });
};

const onGetTask = (data, accessToken, user) => {
  const userId = data.fromusername;
  findInProcessTaskForUser(userId).then(task => {
    logger.info(`--- At ${getTime(data._startedAt)} findInProcessTaskForUser with userId: ${userId}`);
    if (task) {
      // There is a task in process
      return sendToUser.task(task, data, accessToken, user);
    } else {
      // There is no task in process
      return findAndSendNewTaskForUser(data, accessToken, user);
    }
  });
};

// Find a task the user is working on
const findInProcessTaskForUser = userId => {
  const query = new leanCloud.AV.Query('CrowdsourcingTask');
  query.equalTo('user_id', userId);
  query.equalTo('status', 0);
  return query.first();
};

// userId:  user who created content
// content: text content
// task: task user was doing to create this userTranscript
// transcript: transcript from which the task was created
const createUserTranscript = (userId, content, task, transcript) => {
  const type = task.get('fragment_type'),
        UserTranscript = leanCloud.AV.Object.extend('UserTranscript'),
        userTranscript = new UserTranscript(),
        needContent = content === '0';
  let lastReviewTimes;
  if (transcript) {
    lastReviewTimes = transcript.get('review_times') || 0;
  } else {
    lastReviewTimes = 0;
  }
  userTranscript.set('media_id', task.get('media_id'));
  if (!needContent) userTranscript.set('content', content);
  userTranscript.set('fragment_order', task.get('fragment_order'));
  userTranscript.set('user_open_id', userId);
  if (type === 'Transcript') {
    userTranscript.set('review_times', 1);
  } else {
    userTranscript.set('review_times', lastReviewTimes + 1);
  }

  if (transcript && type === 'Transcript') {
    userTranscript.set('fragment_src', transcript.get('fragment_src'));
    userTranscript.set('targetTranscript', transcript);
    if (needContent) {
      content = transcript.get('content_baidu')[0];
      userTranscript.set('content', content);
    }
    return userTranscript.save();
  } else {
    // Get relavent machine transcript from task
    return getMachineTranscript(task).then(transcript => {
      if (transcript) {
        userTranscript.set('fragment_src', transcript.get('fragment_src'));
        userTranscript.set('targetTranscript', transcript);
        if (needContent) {
          content = transcript.get('content_baidu')[0];
          userTranscript.set('content', content);
        }
        return userTranscript.save();
      } else {
        logger.info('Error: no machine transcript for task with id ' + task.id);
        return getTranscript(task).then(transcript => {
          if (transcript) {
            userTranscript.set('fragment_src', transcript.get('fragment_src'));
            if (needContent) {
              content = transcript.get('content');
              userTranscript.set('content', content);
            }
            return userTranscript.save();
          } else {
            logger.info('Error: no transcript for task with id ' + task.id);
            return false;
          }
        });
      }
    }, err => {
      logError('failed getMachineTranscript', err);
    });
  }
};

// userTranscript: on which the task is based
// lastUserId: user who created this task
// source: CrowdsourcingTask.source
// lastTask: the task user did before creating this one
const createCrowdsourcingTask = (userTranscript, lastUserId, source, lastTask) => {
  const newTask = new CrowdsourcingTask();
  newTask.set('fragment_id', userTranscript.id);
  newTask.set('fragment_type', 'UserTranscript');
  newTask.set('fragment_order', userTranscript.get('fragment_order'));
  newTask.set('status', 0);
  newTask.set('media_id', userTranscript.get('media_id'));
  newTask.set('last_user', lastUserId);
  newTask.set('source', source);
  newTask.set('fields', lastTask.get('fields'));
  return newTask.save();
};

// Set user's need_pay
const setNeedPay = user => {
  const minutesDone = user.get('tasks_done') / 4,
        amountPaid = user.get('amount_paid');
  if (minutesDone - amountPaid >= 1) {
    user.set('need_pay', true);
  }
};

const findAndSendNewTaskForUser = (data, accessToken, user) => {
  const userId = data.fromusername;
  findNewTaskForUser(user, data._startedAt).then(task => {
    if (task) {
      return assignTask(task, data, accessToken);
    } else {
      return task;
    }
  }).then(task => {
    if (task) {
      sendToUser.task(task, data, accessToken, user);
    } else {
      // inform user there is no available task
      return sendToUser.text('今天的任务已经被领取完啦，每天我们会在上午9点和下午9点发布任务，欢迎来领取～', data, accessToken);
    }
  });
};

const completeTaskAndReply = (task, data, accessToken, user) => {
  const userId = data.fromusername,
        isCorrect = data.content === '0',
        userRole = user.get('role') || 'B';
  // Change task status to 1, fill in user_role
  task.set('status', 1);
  task.set('user_role', userRole);
  task.save();

  // Find user object
  getUser(userId).then(user => {
    logger.info(`--- At ${getTime(data._startedAt)} completeTaskAndReply / getUser(userId) with userId : ${userId}`);
    // Add 1 to user's tasks done
    const tasksDone = user.get('tasks_done');
    user.set('tasks_done', tasksDone + 1);
    return user.save();
  }).then(user => {
    const tasksDone = user.get('tasks_done');
    logger.info(`--- At ${getTime(data._startedAt)} completeTaskAndReply / 获取完成任务数量 userId : ${userId} / 完成数量: ${tasksDone}`);
    // Check for tasks done
    if (tasksDone === 4) {
      // User has just completed 4 tasks
      sendToUser.text('么么哒，请回复你的微信号（非微信昵称），稍后我会将现金红包发送给你！\n\n微信号登记完成后，领取下一分钟任务，请点击“领取任务”', data, accessToken);

      // Change user status to 1
      user.set('status', 1);

      setNeedPay(user);
      user.save();
    } else if (tasksDone % 4 === 0) {
      // User has completed another 4 tasks. Send text
      sendToUser.text('么么哒，恭喜你又完成了4个任务，我们会将现金红包发送给你！\n\n领取下一分钟任务，请点击“领取任务”', data, accessToken);

      setNeedPay(user);
      user.save();
    } else {
      // User has not completed 4 tasks
      let replyContent = 'biu~我已经收到了你的';

      if (isCorrect) {
        replyContent += '回复';
      } else {
        replyContent += '文字';
      }

      replyContent += '啦，现在正传输给另外一个小伙伴审核。（错误太多，就会把你拉入黑名单，很恐怖哒。）\n\n下一个片段的任务正在路上赶来，一般需要1～3秒时间。';

      sendToUser.text(replyContent, data, accessToken);

      findAndSendNewTaskForUser(data, accessToken, user);
    }
  });
};

const onReceiveTranscription = (data, accessToken, task, user) => {
  const userId = data.fromusername,
        content = data.content,
        hasXX = content.indexOf('XX') !== -1 || content.indexOf('xx') !== -1,
        userRole = user.get('role') || 'B',
        userField = user.get('fields') && user.get('fields')[0];
  let source = 0;

  completeTaskAndReply(task, data, accessToken, user);

  // Get the relevant transcript / userTranscript
  getTranscript(task).then(transcript => {
    const taskType = task.get('fragment_type'),
          oldContent = taskType === 'Transcript' ? transcript.get('content_baidu')[0] : transcript.get('content');
    if (content === oldContent || content === '0') {
      // Mark the transcript wrong_chars = 0
      transcript.set('wrong_chars', 0);
    } else {
      // Mark the transcript wrong_chars = 21
      // Why 21? Because before we use 0-20, 21 is distinct
      transcript.set('wrong_chars', 21);
    }
    transcript.save().then(transcript => {
      // create new UserTranscript to record transcription
      createUserTranscript(userId, content, task, transcript).then(userTranscript => {
        if (userTranscript) {
          if (userRole === 'A' && userField && hasXX) {
            source = 2.1;
          } else if (userRole === 'A' && hasXX) {
            source = 1.1;
          } else if (userRole === '工作人员' && hasXX) {
            source = 3.1;
          }

          if (source) {
            createCrowdsourcingTask(userTranscript, userId, source, task);
          }
        }
      }, err => {
        logError('createUserTranscript', err);
      });
    });
  });
};

// Find last completed task for user
const findLastTaskForUser = userId => {
  const query = new leanCloud.AV.Query('CrowdsourcingTask');
  query.equalTo('user_id', userId);
  query.equalTo('status', 1);
  query.descending('updatedAt');
  return query.first();
};

// Used in findNewTaskForUser, get the task before testing if it is valid
const getTask = user => {
  const userId = user.get('open_id'),
        userRole = user.get('role') || 'B',
        userField = user.get('fields') && user.get('fields')[0];

  /**
   * @param  {Dict} options
   * @param  {Array} options.source  Min and Max (excluding) for source, e.g. [1, 2]
   * @param  {String} options.field
   * @param  {Bolean} options.noField
   * @param  {String} options.notField
   */
  const _constructQuery = options => {
    const query = new leanCloud.AV.Query('CrowdsourcingTask'),
          source = options.source || 0;
    if (source) {
      query.greaterThan('source', source[0]);
      query.lessThan('source', source[1]);
    } else {
      query.equalTo('source', source);
    }
    query.ascending('createdAt');
    query.equalTo('status',0);
    query.doesNotExist('user_id');
    query.notEqualTo('last_user', userId);
    query.notEqualTo('passed_users', userId);
    if (options.field) query.equalTo('fields', options.field);
    if (options.noField) query.doesNotExist('fields');
    if (options.notField) query.notEqualTo('fields', options.notField);

    return query;
  };

  let query;
  if (userRole === 'A' && userField) {
    // 帮主
    // 1. 自己专业领域的机器任务
    query = _constructQuery({field: userField});
    return query.first().then(task => {
      if (task) return task;
      // 2. 自己专业领域的，帮众做完带XX或者“过”的
      query = _constructQuery({field: userField, source: [1, 2]});
      return query.first().then(task => {
        if (task) return task;
        // 3. 没有任何专业领域的机器任务
        query = _constructQuery({noField: true});
        return query.first().then(task => {
          if (task) return task;
          // 4. 其他专业领域的机器任务
          query = _constructQuery({notField: userField});
          return query.first();
        });
      });
    });
  } else if (userRole === 'A') {
    // 帮众
    query = _constructQuery({noField: true});
    return query.first().then(task => {
      if (task) return task;
      query = _constructQuery({});
      return query.first();
    });
  } else if (userRole === '工作人员') {
    // 工作人员
    // 1. 帮主做完带XX或者“过”的
    query = _constructQuery({source: [2, 3]});
    return query.first().then(task => {
      if (task) return task;
      // 2. 没有任何专业领域的，帮众做完带XX或者“过”的
      query = _constructQuery({noField: true, source: [1, 2]});
      return query.first().then(task => {
        if (task) return task;
        // 3. 有专业领域的，帮众做完带XX或者“过”的
        query = _constructQuery({source: [1, 2]});
        return query.first().then(task => {
          if (task) return task;
          // 4. 任何机器任务
          query = _constructQuery({});
          return query.first();
        });
      });
    });
  } else if (userRole === 'B端用户') {
    // B端用户
    // 工作人员做完带XX或者“过”的
    query = _constructQuery({source: [3, 4]});
    return query.first();
  } else {
    logger.info(`Error: invalid role to get task. User role: ${userRole}. User open id: ${userId}`);
    return Promise.resolve(false);
  }
};

const findNewTaskForUser = (user, _startedAt) => {
  const userId = user.get('open_id');
  return getTask(user).then(task => {
    logger.info(`--- At ${getTime(_startedAt)} findNewTaskForUser / get task with userOpenId: ${userId}`);
    if (task) {
      // Check if content and fragment_src are empty
      return isTaskValid(task, _startedAt).then(taskValid => {
        if (taskValid) return task;
        // Destroy the task
        return task.destroy().then(success => {
          logger.info(`--- At ${getTime(_startedAt)} findNewTaskForUser / task.destroy() with userOpenId: ${userId}`);
          // Find new task
          return findNewTaskForUser(user, _startedAt);
        }, err => {
          logError('failed destroying task', err);
        });
      });
    } else {
      return task;
    }
  });
};

// const findNextTaskForUser = (userId, task) => {
//   const query = new leanCloud.AV.Query('CrowdsourcingTask');
//   query.equalTo('fragment_order', task.get('fragment_order') + 1);
//   query.ascending('createdAt');
//   query.equalTo('status', 0);
//   query.equalTo('fragment_type', task.get('fragment_type'));
//   query.doesNotExist('user_id');
//   query.equalTo('media_id', task.get('media_id'));
//   return query.first();
// };

// // Find a new/next task for user
// const findTaskForUser = (userId) => {
//   return findLastTaskForUser(userId)
//     .then(task => {
//       if (task) {
//         if ((task.get('fragment_order') + 1) % 4 === 0) {
//           return findNewTaskForUser(userId);
//         } else {
//           return findNextTaskForUser(userId, task)
//             .then(task => {
//               if (task) {
//                 return task;
//               } else {
//                 return findNewTaskForUser(userId);
//               }
//             });
//         }
//       } else {
//         return findNewTaskForUser(userId);
//       }
//     });
// };

const getUser = userId => {
  const query = new leanCloud.AV.Query('WeChatUser');
  query.equalTo('open_id', userId);
  return query.first();
};

const onReceiveWeChatId = (data, accessToken, user) => {
  const content = data.content;
  if (content === '1') {
    // Change user status
    user.set('status', -200);
    user.save().then(user => {
      logger.info(`--- At ${getTime(data._startedAt)} onReceiveWeChatId / set status -200 `);
      // Send image to let user add xiaozhushou
      sendToUser.image(wechatConfig.mediaId.image.xiaozhushou, data.fromusername, accessToken, data._startedAt)
        .then(() => {
          setTimeout(() => {
            // Send first question
            sendToUser.text(savedContent.secondMin[0].q, data, accessToken);
          }, 2000);
        });
    });
  } else {
    // Save WeChatId, ask for confirmation
    user.set('wechat_id', content);
    user.save().then(user => {
      logger.info(`--- At ${getTime(data._startedAt)} onReceiveWeChatId / set wechat_id :${content}`);
      sendToUser.text(`微信号：${content}。确认请回复1，修改请回复新的微信号。`, data, accessToken);
    });
  }
};

// Get the related transcript or userTranscript from a task
const getTranscript = task => {
  const type = task.get('fragment_type'),
        id = task.get('fragment_id'),
        query = new leanCloud.AV.Query(type);
  return query.get(id);
};

// Get the relavent machine transcript from a task
const getMachineTranscript = task => {
  const type = task.get('fragment_type');

  if (type === 'Transcript') {
    return getTranscript(task);
  } else {
    // type === 'UserTranscript'
    const query = new leanCloud.AV.Query('Transcript');
    query.equalTo('media_id', task.get('media_id'));
    query.equalTo('fragment_order', task.get('fragment_order'));
    query.equalTo('set_type', 'machine');
    return query.first();
  }
};

const sendGA = (userId, eventAction) => {
  const payload = `v=1&t=event&tid=${gaConfig.tid}&cid=${userId}&ec=task&ea=${eventAction}&uid=${userId}`;
  request.post({
    url: 'https://www.google-analytics.com/collect',
    body: payload
  }, (error, response, body) => {
    if (error) {
      logError('failed sending GA', error);
    }
  });
};

const onReceiveNoVoice = (data, accessToken, task, user) => {
  const userId = data.fromusername;

  // Change task status to 1
  task.set('status', 2);
  task.save();

  const replyContent = 'biu~谢谢你的反馈。正在为你寻找新的任务...';

  sendToUser.text(replyContent, data, accessToken);

  findAndSendNewTaskForUser(data, accessToken, user);
};

const logError = (message, err) => {
  logger.info('Error: ' + message + '.');
  logger.info(err);
};

const findUserTranscriptFromTaskByUser = (task, userId) => {
  const query = new leanCloud.AV.Query('UserTranscript');
  query.equalTo('user_open_id', userId);
  query.equalTo('media_id', task.get('media_id'));
  query.equalTo('fragment_order', task.get('fragment_order'));
  return query.first();
};

const onReceiveRevoke = (data, accessToken, user) => {
  // Change user status to 2
  user.set('status', 2);
  user.save().then(user => {
    // Tell user that he has entered revoke mode
    sendToUser.text('biu~进入修改模式，即将为你取回上一条任务。', data, accessToken);
    // Send last task's voice with user's content
    findLastTaskForUser(user.get('open_id')).then(task => {
      findUserTranscriptFromTaskByUser(task, user.get('open_id')).then(userTranscript => {
        if (userTranscript) {
          // Send user's content
          sendToUser.text(userTranscript.get('content'), data, accessToken);
          // Send voice
          getTranscript(task).then(transcript => {
            sendToUser.voice(transcript, data, accessToken);
          });
        } else {
          // No user's content
          sendToUser.task(task, data, accessToken, user);
        }
      });
    }, err => {
      logError('failed getting last task in revoke mode', err);
    });
  }, err => {
    logError('failed saving user when entering revoke mode', err);
  });
};

const onReceiveRevokeTranscription = (data, accessToken, user) => {
  if (data.content === '0') {
    // Switch back to normal mode
    user.set('status', 0);
    user.save().then(user => {
      sendToUser.text('biu~已退出修改模式，继续做任务请点击“领取任务”。', data, accessToken);
    });
  } else {
    findLastTaskForUser(user.get('open_id')).then(task => {
      return findUserTranscriptFromTaskByUser(task, user.get('open_id')).then(userTranscript => {
        if (userTranscript) {
          // Update last created userTranscript's content
          userTranscript.set('content', data.content);
          return userTranscript.save();
        } else {
          return getTranscript(task).then(transcript => {
            return createUserTranscript(user.get('open_id'), data.content, task, transcript);
          });
        }
      });
    }).then(userTranscript => {
      // Change user status back to 0
      user.set('status', 0);
      return user.save();
    }).then(user => {
      // Tell user that he is back to normal mode
      return sendToUser.text('biu~修改完成！继续做任务请点击“领取任务”。', data, accessToken);
    });
  }
};

const onFirstMin = (data, accessToken, user) => {
  const userStatus = user.get('status'),
        tasksDone = user.get('tasks_done'),
        userId = user.get('open_id');
  let order = (userStatus * -1) - 300;

  // Create UserTranscript
  const userTranscript = new UserTranscript();
  userTranscript.set('media_id', 'first_min');
  userTranscript.set('content', data.content);
  userTranscript.set('fragment_order', order);
  userTranscript.set('user_open_id', userId);
  userTranscript.set('review_times', 0);
  userTranscript.save().then(userTranscript => {
    // Change user status and tasks_done
    user.set('status', userStatus - 1);
    user.set('tasks_done', tasksDone + 1);
    if (order < 3) {
      // Tell user we received his message
      sendToUser.text('biu~我已经收到你的回复啦！\n下一个任务正在路上，一般需要1～3秒时间。', data, accessToken);

      order += 1;
      user.save().then(user => {
        // Send next task
        // Send text
        sendToUser.text(savedContent.firstMin[order], data, accessToken);
        // Send voice in 1s
        setTimeout(() => {
          sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe1[order], userId, accessToken, data._startedAt);
        }, 1000);
      });
    } else {
      user.set('status', 1);
      user.set('need_pay', true);
      user.save().then(user => {
        // Ask for wechat id
        sendToUser.text('么么哒，恭喜你完成了4个任务！\n请回复你的微信号（非微信昵称），稍后我们会将现金红包发送给你！', data, accessToken);
      });
    }
  });
};

const onSecondMin = (data, accessToken, user) => {
  const userStatus = user.get('status'),
        tasksDone = user.get('tasks_done'),
        userId = user.get('open_id'),
        content = data.content;
  let order = (userStatus * -1) - 200,
      answer,
      replyMessage;

  // Set the correct answer
  if (order === 0 || order === 3) {
    answer = '1';
  } else if (order === 1 || order === 2) {
    answer = '2';
  } else if (order === 4) {
    answer = '3';
  } else {
    answer = '规则';
  }

  if (content === answer && answer !== '规则') {
    // User is correct && it isn't the last question
    order += 1;
    replyMessage = '么么哒~正确！恭喜你成功完成了';
    replyMessage += order;
    replyMessage += '/6个任务，接下来继续作答吧，';
    replyMessage += '现金红包正在向你招手！';
    user.set('status', userStatus - 1);
    user.save().then(user => {
      sendToUser.text(replyMessage, data, accessToken)
      .then(() => {
        sendToUser.text(savedContent.secondMin[order].q, data, accessToken);
      });
    });
  } else if (content === answer) {
    // User is correct && it is the last question
    // Change user status
    user.set('status', -100);
    user.set('tasks_done', tasksDone + 4);
    user.set('need_pay', true);
    user.save().then(user => {
      // Send image
      sendToUser.image(wechatConfig.mediaId.image.rule, userId, accessToken, data._startedAt).then(() => {
        // Send text
        const text = '么么哒~正确！恭喜你成功完成所有任务，现金红包正在向你招手！\n\n领取新的任务，请点击下方“领取任务”。注意，我们将开始对你的答案进行审核，如果正确率过低，会被拉入黑名单噢。';
        setTimeout(() => {
          sendToUser.text(text, data, accessToken);
        }, 2000);
      });
    });
  } else {
    // User is not correct
    const text = '你肯定是不小心手滑写错了，这个答案是错误的，请再次作答！';
    sendToUser.text(text, data, accessToken);
  }
};

const onThirdMin = (data, accessToken, user) => {
  const userStatus = user.get('status'),
        tasksDone = user.get('tasks_done'),
        userId = user.get('open_id');
  let order = (userStatus * -1) - 100;

  // Create UserTranscript
  const userTranscript = new UserTranscript();
  userTranscript.set('media_id', 'third_min');
  userTranscript.set('content', data.content);
  userTranscript.set('fragment_order', order);
  userTranscript.set('user_open_id', userId);
  userTranscript.set('review_times', 0);
  userTranscript.save().then(userTranscript => {
    // Change user status and tasks_done
    user.set('status', userStatus - 1);
    user.set('tasks_done', tasksDone + 1);
    if (order < 3) {
      // Tell user we received his message
      sendToUser.text('biu~我已经收到你的回复啦！\n下一个任务正在路上，一般需要1～3秒时间。', data, accessToken);

      order += 1;
      user.save().then(user => {
        // Send next task
        // Send text
        sendToUser.text(savedContent.thirdMin[order], data, accessToken)
          .then(() => {
            // Send voice in 1s
            setTimeout(() => {
              sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe2[order], userId, accessToken, data._startedAt);
            }, 1000);
          });
      });
    } else {
      user.set('status', -1);
      user.set('need_pay', true);
      user.save().then(user => {
        sendToUser.text('你好，恭喜完成了1分钟的片段，我们将对你的内容进行审核，审核期间将无法领取任务，最快时间1天就能审核结束～', data, accessToken);
      });
    }
  });
};

const setPrice = (data, user) => {
  const sceneId = +(data.eventkey.replace('qrscene_', '')),
        price = sceneId / 10;
  user.set('price', price);
  user.save().then(user => {
    logger.info('Price setted for open_id:');
    logger.info(user.get('open_id'));
  }, err => {
    logError('failed setting price', err);
  });
};

const onReceiveNotMatch = (data, accessToken, task, user) => {
  // Get machine content
  getMachineTranscript(task).then(transcript => {
    if (transcript) {
      // Send content to user
      const content = transcript.get('content_baidu')[0];
      sendToUser.text(content, data, accessToken).then(() => {
        setTimeout(() => {
          sendToUser.text('biu~上面是我们对于这段语音翻译到最好的程度啦，只能帮你到这里了~', data, accessToken);
        }, 2000);
      });
    }
  });
};

const onReceivePrevNext = (data, accessToken, task) => {
  // Get the prev/next transcript
  const mediaId = task.get('media_id'),
        query = new leanCloud.AV.Query('Transcript'),
        content = 'biu~抱歉，没有找到所请求的片段。';
  let order = task.get('fragment_order');
  if (data.content === '前') {
    order -= 1;
  } else {
    order += 1;
  }
  query.equalTo('media_id', mediaId);
  query.equalTo('fragment_order', order);
  query.equalTo('set_type', 'machine');
  query.first().then(transcript => {
    if (transcript) {
      // Send audio
      sendToUser.singleVoice(transcript, data, accessToken);
    } else {
      sendToUser.text(content, data, accessToken);
    }
  });
};

const onReceivePass = (data, accessToken, task, user) => {
  const userId = data.fromusername,
        userRole = user.get('role') || 'B',
        userField = user.get('fields') && user.get('fields')[0];
  // Set original task to unassigned status
  task.unset('user_id');
  task.addUnique('passed_users', userId);
  if (userRole === 'A' && userField) {
    task.set('source', 2.2);
  } else if (userRole === 'A') {
    task.set('source', 1.2);
  } else if (userRole === '工作人员') {
    task.set('source', 3.2);
  } else if (userRole !== 'B端用户') {
    logger.info('Error: user with invalid role is passing a task. User open id: ${userId}. User role: ${userRole}');
  }
  task.save().then(task => {
    findAndSendNewTaskForUser(data, accessToken, user);
  });
};

module.exports.postCtrl = (req, res, next) => {
  // Reply success to avoid error and repeated request
  res.send('success');

  const data = req.body.xml,
        userId = data.fromusername,
        Scene = leanCloud.AV.Object.extend('Scene');

  let scene;

  const startedAt = new Date();
  data._startedAt = startedAt;
  logger.info(`--- At ${startedAt} get user ${userId} response`);

  const accessTokenPromise = getAccessTokenFromCache(undefined, startedAt);
  const userPromise = getUser(userId).then(user => {
    if (user) {
      return user;
    } else {
      return createUser(userId);
    }
  });

  Promise.all([accessTokenPromise, userPromise]).then(results => {
    const accessToken = results[0],
          user = results[1],
          userStatus = user.get('status'),
          wechatId = user.get('wechat_id'),
          tasksDone = user.get('tasks_done');
    let order;

    logger.info(`--- At ${getTime(startedAt)} get user ${userId} data from leancloud.`);
    logger.info('user:');
    logger.info(user.toJSON());

    if (data.msgtype === 'text') {
      if (data.content === '网络测试') {
        sendToUser.text('网络测试成功', data, accessToken);
        logger.info('User testing connection:');
        logger.info(userId);
        sendGA(userId, 'test_internet');
      } else if (data.content === '规则' && userStatus !== -205) {
        sendToUser.image(wechatConfig.mediaId.image.rule, userId, accessToken, startedAt);
        sendGA(userId, 'rule');
      }  else if (data.content === '模板消息测试') {
        // 发送模板消息
        sendModelMessage(data, accessToken);
      } else {
        // Check status
        if (userStatus >= -304 && userStatus <= -300) {
          // First min tasks
          onFirstMin(data, accessToken, user);
          sendGA(userId, 'reply_first_min');
        } else if (userStatus >= -206 && userStatus <= -200) {
          onSecondMin(data, accessToken, user);
          sendGA(userId, 'reply_second_min');
        } else if (userStatus >= -104 && userStatus <= -100) {
          onThirdMin(data, accessToken, user);
          sendGA(userId, 'reply_third_min');
        } else if (userStatus === 1) {
          // Waiting for WeChat ID
          onReceiveWeChatId(data, accessToken, user);
          sendGA(userId, 'reply_wechat_id');
        } else if (userStatus === 2) {
          // Revoke mode
          onReceiveRevokeTranscription(data, accessToken, user);
          sendGA(userId, 'reply_revoke');
        } else {
          // User status === 0 or -1
          if (data.content === '修改') {
            // Enter revoke mode
            onReceiveRevoke(data, accessToken, user);
            sendGA(userId, 'enter_revoke_mode');
          } else {
            findInProcessTaskForUser(userId).then(task => {
              logger.info(`--- At ${getTime(startedAt)} get task for user ${userId} data from leancloud.`);
              if (task) {
                if (data.content === '没有语音') {
                  onReceiveNoVoice(data, accessToken, task);
                  sendGA(userId, 'reply_no_voice');
                } else if (data.content === '不对应') {
                  onReceiveNotMatch(data, accessToken, task, user);
                  sendGA(userId, 'reply_not_match');
                } else if (data.content === '前') {
                  onReceivePrevNext(data, accessToken, task);
                  sendGA(userId, 'reply_prev');
                } else if (data.content === '后') {
                  onReceivePrevNext(data, accessToken, task);
                  sendGA(userId, 'reply_next');
                } else if (data.content === '过') {
                  onReceivePass(data, accessToken, task, user);
                  sendGA(userId, 'reply_pass');
                } else if (data.content === '不对应') {
                  onReceiveNotMatch(data, accessToken, task, user);
                  sendGA(userId, 'reply_not_match');
                } else if (data.content === '前') {
                  onReceivePrevNext(data, accessToken, task);
                  sendGA(userId, 'reply_prev');
                } else if (data.content === '后') {
                  onReceivePrevNext(data, accessToken, task);
                  sendGA(userId, 'reply_next');
                } else {
                  onReceiveTranscription(data, accessToken, task, user);
                  sendGA(userId, 'reply');
                }
              } else {
                sendGA(userId, 'not_anything');
              }
            });
          }
        }
      }
    } else if (data.msgtype === 'event') {
      if (data.event === 'subscribe') {
        if (userStatus === -300) {
          onSubscribe(data, accessToken);
          sendGA(userId, 'new_subscription');
        } else {
          sendGA(userId, 'return_subscription');
        }

        if (data.eventkey) {
          setPrice(data, user);
        }
      } else if (data.event === 'CLICK' && data.eventkey === 'GET_TASK') {
        // Check if the user has wechat_id recorded if the user has done more than 4 tasks
        if (userStatus === 0 && tasksDone >= 4 && !wechatId) {
          sendToUser.text('请回复你的微信号（非微信昵称），否则不能给你发红包噢！\n\n微信号登记完成后，继续领取任务，请点击“领取任务”', data, accessToken);

          // Change user status to 1
          user.set('status', 1);
          user.save();
        } else if (userStatus === 0) {
          onGetTask(data, accessToken, user);
        } else if (userStatus === 1) {
          sendToUser.text('biu~正在登记微信号，无法领取任务。请先回复你的微信号噢。', data, accessToken);
        } else if (userStatus === 2) {
          sendToUser.text('biu~正在修改模式中，无法领取任务。可直接回复修改后的内容或者回复“0”退出修改模式。', data, accessToken);
        } else if (userStatus >= -104 && userStatus <= -100) {
          order = -100 - userStatus;
          sendToUser.text(savedContent.thirdMin[order], data, accessToken)
            .then(() => {
              sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe2[order], userId, accessToken, startedAt);
            });
        } else if (userStatus >= -304 && userStatus <= -300) {
          order = -300 - userStatus;
          // Send text
          sendToUser.text(savedContent.firstMin[order], data, accessToken);
          // Send voice in 1s
          setTimeout(() => {
            sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe1[order], userId, accessToken, startedAt);
          }, 1000);
        } else if (userStatus >= -206 && userStatus <= -200) {
          order = -200 - userStatus;
          sendToUser.text(savedContent.secondMin[order].q, data, accessToken);
        } else if (userStatus === -1) {
          sendToUser.text('你好，欢迎你对1\'61的关注，你暂时没有被开通“领取任务”功能，只有经过“新手训练营”测试的童鞋才会被开通。目前“新手训练营”属于邀请制，我们会一一邀请大家来参与测试的，谢谢大家。', data, accessToken);
        } else {
          // Should not get here
          logger.info('Error: need get task handler');
        }
        sendGA(userId, 'click_get_task');
      } else if (data.event === 'SCAN') {
        // onQRCodeScanned(data, accessToken, res);
      }
    }
  });
};
module.exports.getCtrl = (req, res, next) => {
  res.send(req.query.echostr);
};
module.exports.getAccessToken = getAccessTokenFromCache;
// module.exports.findTaskForUser = findTaskForUser;
module.exports.findInProcessTaskForUser = findInProcessTaskForUser;