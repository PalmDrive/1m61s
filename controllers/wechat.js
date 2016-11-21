'use strict';

const request = require('request'),
      exec = require('child_process').exec,
      fs = require('fs'),
      leanCloud = require('../lib/lean_cloud'),
      UserTranscript = leanCloud.AV.Object.extend('UserTranscript'),
      xml = require('xml'),
      datetime = require('../lib/datetime'),
      logger = require('../lib/logger'),
      wechatConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).wechat,
      gaConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).ga,
      redisClient = require('../redis_client'),
      correctContent = '0';

const savedContent = {};
savedContent.firstMin = [
  '我今天演讲猪蹄是努力把最简单的事情，最好剩下的就是坚持，我会大概回顾一下在过去二十个月成长的点点滴滴，也跟大家做一个分享和交流，',
  '知道今天非常冷！我来之前说，这个现场可能这个来的人也会比多，因为大家在这么早的时间就可以来到这里好听分享和交流，也许还有一些人还没有完全打开睡眼，',
  '她老说你是不是可以带大家一起跳一个健身操啊，我说这个健身操有一点点难，但是我还是希望可以带着大家做一些简单的简单的小的放松，我们先来一场这个身体的奇幻旅程却在可以发现，',
  '每个人的身体是非常有趣的一件事情，可能通过一些简单的变化，只说一种一种心理和生理上变化，你就会觉得你的身体会发生很多奇妙的变化，如果大家现在方便的话可以一起的，做几个简单的动作好吗？'
];
savedContent.secondMin = [
  {
    q: '第1题：他 v.s 她 v.s 它\n机器一般会默认写“他”，但大部分其实是“它”，比如公司名呀、商业模式呀等等，大家一定要留意一下。\n\n问：如果语音里是公司名，你收到对应的文字是“他”，那么，你是否需要修改这个字？\n1. 需要\n2. 不需要',
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
    q: '第6题： 规则\n当不知道一个具体情况该如何处理时，回复“规则”就能蹦出来各种情况下的解决方案啦。\n\n问：请回复一下“规则”。',
    a: '规则'
  }
];
// TODO: fill the content
savedContent.thirdMin = ['3-0', '3-1', '3-2', '3-3'];

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

const getAccessTokenFromCache = (options) => {
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

          logger.info(data.access_token);
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

const uploadMedia = (mediaSrc, type, token) => {
  const url = `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=${type}`;

  return new Promise((resolve, reject) => {
    request.post({
      url,
      formData: {
        media: fs.createReadStream(mediaSrc)
      }
    }, (error, response, body) => {
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
 * @param {Number} data.createtime
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
      }, (error, response, body) => {
        if (error) { return reject(error); }
        if (body.errcode) {
          reject(body);
        } else {
          resolve(body);
        }
      });
    });
  },
  image(mediaId, userId, accessToken) {
    const body = {
            touser: userId,
            msgtype: 'image',
            image: {
              media_id: mediaId
            }
          };
    return this.message(body, accessToken);
  },
  // Send a text message to user
  text(content, data, accessToken) {
    return this.message({
      touser: data.fromusername,
      msgtype: 'text',
      text: {content}
    }, accessToken);
  },
  // Send a voice message to user
  voice(transcript, data, accessToken) {
    const audioURL = transcript.get('fragment_src'),
          audioId = transcript.id,
          mediaSrc = `${global.APP_ROOT}/tmp/${audioId}.mp3`,
          splitPath1 = `${global.APP_ROOT}/tmp/${audioId}_split1.mp3`,
          splitPath2 = `${global.APP_ROOT}/tmp/${audioId}_split2.mp3`,
          ws = fs.createWriteStream(mediaSrc),
          self = this;

    ws.on('finish', () => {
        logger.info('Audio saved in local');

        exec(`ffprobe ${mediaSrc} 2>&1 | grep Duration`, (error, stdout, stderr) => {
          if (error) {
            logError('exec error', error);
            return;
          }
          const duration = parseDuration(stdout);
          logger.info('Audio length in seconds:');
          logger.info(duration);

          if (duration > 8) {
            const cutPoint = duration / 2;

            // First half fragment
            exec(`ffmpeg -f wav -i ${mediaSrc} -t ${cutPoint} ${splitPath1}`, (error, stdout, stderr) => {
              if (error) {
                logger.info(`split file 1 exec error: ${error}`);
                return;
              }
              logger.info('Finished split file 1');

              uploadMedia(splitPath1, 'voice', accessToken)
              .then(media => {
                logger.info('split media 1 uploaded:');
                logger.info(media);

                // Delete local audio file
                fs.unlink(splitPath1);

                // Send the voice message
                self.message({
                  touser: data.fromusername,
                  msgtype: 'voice',
                  voice: {media_id: media.media_id}
                }, accessToken).then(() => {
                  // Second half fragment
                  exec(`ffmpeg -f wav -ss ${cutPoint} -i ${mediaSrc} ${splitPath2}`, (error, stdout, stderr) => {
                    if (error) {
                      logger.info(`split file 2 exec error: ${error}`);
                      return;
                    }
                    logger.info('Finished split file 2');

                    uploadMedia(splitPath2, 'voice', accessToken)
                    .then(media => {
                      logger.info('split media 2 uploaded:');
                      logger.info(media);

                      // Delete local audio file
                      fs.unlink(splitPath2);
                      fs.unlink(mediaSrc);

                      // Wait 1s to send the voice message
                      setTimeout(() => {
                        self.message({
                          touser: data.fromusername,
                          msgtype: 'voice',
                          voice: {media_id: media.media_id}
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
            uploadMedia(mediaSrc, 'voice', accessToken)
              .then(media => {
                logger.info('media uploaded: ');
                logger.info(media);

                // Delete local audio file
                fs.unlink(mediaSrc);

                // Send the voice message
                return self.message({
                  touser: data.fromusername,
                  msgtype: 'voice',
                  voice: {media_id: media.media_id}
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
      if (err) {
        self.text('biu~抱歉，获取语音出现问题，请回复“没有语音”，系统会为你准备新的任务。', data, accessToken);
        logger.info('request audio error: ');
        logger.info(err);
        logger.info('audio URL: ');
        logger.info(audioURL);
      }
    }).pipe(ws);
  },
  // Send an uploaded voice
  voiceByMediaId(mediaId, userId, accessToken) {
    const body = {
            touser: userId,
            msgtype: 'voice',
            voice: {media_id: mediaId}
          };
    return this.message(body, accessToken);
  },
  // Send voice and text to the user
  task(task, data, accessToken) {
    // get Transcript or UserTranscript
    const type = task.get('fragment_type'),
          fragmentId = task.get('fragment_id'),
          query = new leanCloud.AV.Query(type),
          self = this;
    return query.get(fragmentId).then(transcript => {
      // This transcript can be Transcript or UserTranscript
      if (transcript) {
        const content = type === 'Transcript' ? transcript.get('content_baidu')[0] : transcript.get('content');
        // Send text in transcript
        self.text(content, data, accessToken);
        // Send voice
        self.voice(transcript, data, accessToken);
      } else {
        logger.info('Did not find transcript with id: ');
        logger.info(fragmentId);

        // Should not get here when normal
        return self.text('对不起，系统错误，请联系管理员。', data, accessToken);
      }
    }, err => {
      logError('failed getting transcript when sending task', err);
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
  return weChatUser.save();
};

const onSubscribe = (data, accessToken) => {
  const userId = data.fromusername;
  // Send image of introduction
  sendToUser.image(wechatConfig.mediaId.image.subscribe, userId, accessToken).then(() => {
    // Send text in 1s
    setTimeout(() => {
      sendToUser.text(savedContent.firstMin[0], data, accessToken);
    }, 1000);
    // Send voice in 2s
    setTimeout(() => {
      sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe1[0], userId, accessToken);
    }, 2000);
  });
};

// Assign the task to the user in database
const assignTask = (task, userId) => {
  task.set('user_id', userId);
  return task.save().catch(error => {
    logger.info('assign task error: ');
    logger.info(error);
  });
};

const isTaskValid = task => {
  const type = task.get('fragment_type'),
        id = task.get('fragment_id'),
        query = new leanCloud.AV.Query(type);

  return query.get(id).then(transcript => {
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

const onGetTask = (data, accessToken) => {
  const userId = data.fromusername;
  findInProcessTaskForUser(userId).then(task => {
    if (task) {
      // There is a task in process
      return sendToUser.task(task, data, accessToken);
    } else {
      // There is no task in process
      return findAndSendNewTaskForUser(data, accessToken);
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
        userTranscript = new UserTranscript();

  userTranscript.set('media_id', task.get('media_id'));
  userTranscript.set('content', content);
  userTranscript.set('fragment_order', task.get('fragment_order'));
  userTranscript.set('user_open_id', userId);
  if (type === 'Transcript') {
    userTranscript.set('review_times', 1);
  } else {
    userTranscript.set('review_times', 2);
  }

  if (transcript && type === 'Transcript') {
    userTranscript.set('fragment_src', transcript.get('fragment_src'));
    userTranscript.set('targetTranscript', transcript);
    return userTranscript.save();
  } else {
    // Get relavent machine transcript from task
    return getMachineTranscript(task).then(transcript => {
      if (transcript) {
        userTranscript.set('fragment_src', transcript.get('fragment_src'));
        userTranscript.set('targetTranscript', transcript);
        return userTranscript.save();
      } else {
        logger.info('Error: no machine transcript for task with id ' + task.id);
        return getTranscript(task).then(transcript => {
          if (transcript) {
            userTranscript.set('fragment_src', transcript.get('fragment_src'));
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
const createCrowdsourcingTask = (userTranscript, lastUserId) => {
  const CrowdsourcingTask = leanCloud.AV.Object.extend('CrowdsourcingTask'),
        newTask = new CrowdsourcingTask();

    newTask.set('fragment_id', userTranscript.id);
    newTask.set('fragment_type', 'UserTranscript');
    newTask.set('fragment_order', userTranscript.get('fragment_order'));
    newTask.set('status', 0);
    newTask.set('media_id', userTranscript.get('media_id'));
    newTask.set('last_user', lastUserId);

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

// Very similar to onGetTask, however doesn't check for in process task
const findAndSendNewTaskForUser = (data, accessToken) => {
  const userId = data.fromusername;
  findNewTaskForUser(userId).then(task => {
    if (task) {
      return assignTask(task, userId);
    } else {
      return task;
    }
  }).then(task => {
    if (task) {
      sendToUser.task(task, data, accessToken);
    } else {
      // inform user there is no available task
      return sendToUser.text('今天的任务已经被领取完啦，每天我们会在早上9点发布任务，欢迎早起来领取～', data, accessToken);
    }
  });
};

const completeTaskAndReply = (task, data, accessToken) => {
  const userId = data.fromusername,
        isCorrect =  data.content === correctContent ? true : false;
  // Change task status to 1
  task.set('status', 1);
  task.save();

  // Find user object
  getUser(userId).then(user => {
    // Add 1 to user's tasks done
    const tasksDone = user.get('tasks_done');
    user.set('tasks_done', tasksDone + 1);
    return user.save();
  }).then(user => {
    const tasksDone = user.get('tasks_done');
    // Check for tasks done
    if (tasksDone === 4) {
      // User has just completed 4 tasks
      sendToUser.text('么么哒，请回复你的微信号（非微信昵称），稍后我会将1元奖励发送给你！\n\n微信号登记完成后，领取下一分钟任务，请点击“领取任务”', data, accessToken);

      // Change user status to 1
      user.set('status', 1);

      setNeedPay(user);
      user.save();
    } else if (tasksDone % 4 === 0) {
      // User has completed another 4 tasks. Send text
      sendToUser.text('么么哒，恭喜你又完成了4个任务，我们会将1元奖励发送给你！\n\n领取下一分钟任务，请点击“领取任务”', data, accessToken);

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

      findAndSendNewTaskForUser(data, accessToken);
    }
  });
};

const onReceiveTranscription = (data, accessToken, task) => {
  const userId = data.fromusername,
        content = data.content;

  completeTaskAndReply(task, data, accessToken);

  // Get the relevant transcript / userTranscript
  getTranscript(task).then(transcript => {
    const taskType = task.get('fragment_type'),
          oldContent = taskType === 'Transcript' ? transcript.get('content_baidu')[0] : transcript.get('content');
    if (content === oldContent) {
      // Mark the transcript wrong_chars = 0
      transcript.set('wrong_chars', 0);
      transcript.save();
    } else {
      // New content
      // create new UserTranscript to record transcription
      createUserTranscript(userId, content, task, transcript).then(userTranscript => {
        // Create crowdsourcingTask only when the previous transcript is machine-produced. This ensures a fragment is only distributed 2 times
        if (userTranscript && taskType === 'Transcript') {
          // Create new crowdsourcingTask
          createCrowdsourcingTask(userTranscript, userId);
        }
      });

      // Mark the transcript wrong_chars = 21
      // Why 21? Because before we use 0-20, 21 is distinct
      transcript.set('wrong_chars', 21);
      transcript.save();
    }
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

const findNewTaskForUser = userId => {
  const _constructQuery = fragmentType => {
    const query = new leanCloud.AV.Query('CrowdsourcingTask');
    // query.equalTo('is_head', true);
    query.ascending('createdAt');
    query.equalTo('status',0);
    query.doesNotExist('user_id');
    query.notEqualTo('last_user', userId);
    query.equalTo('fragment_type', fragmentType);
    return query;
  };

  let query = _constructQuery('UserTranscript');

  return query.first().then(task => {
    if (task){
      return task;
    } else {
      query = _constructQuery('Transcript');
      return query.first();
    }
  }).then(task => {
    if (task) {
      // Check if content and fragment_src are empty
      return isTaskValid(task).then(taskValid => {
        if (taskValid) {
          return task;
        }
        // Destroy the task
        return task.destroy().then(success => {
          // Find new task
          return findNewTaskForUser(userId);
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
      // TODO: change the reply. Start second min questions
      // Send image to let user add xiaozhushou
      sendToUser.image(wechatConfig.mediaId.image.xiaozhushou, data.fromusername, accessToken)
        .then(() => {
          // Send first question
          sendToUser.text(savedContent.secondMin[0].q, data, accessToken);
        });
    });
  } else {
    // Save WeChatId, ask for confirmation
    user.set('wechat_id', content);
    user.save().then(user => {
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

const onReceiveCorrect = (data, accessToken, task) => {
  completeTaskAndReply(task, data, accessToken);

  // Mark the transcript wrong_chars = 0
  getTranscript(task).then(transcript => {
    transcript.set('wrong_chars', 0);
    transcript.save();
  });
};

const sendGA = (userId, eventAction) => {
  const payload = `v=1&t=event&tid=${gaConfig.tid}&cid=${userId}&ec=task&ea=${eventAction}`;
  request.post({
    url: 'https://www.google-analytics.com/collect',
    body: payload
  }, (error, response, body) => {
    if (error) {
      logError('failed sending GA', error);
    }
  });
};

const onReceiveNoVoice = (data, accessToken, task) => {
  const userId = data.fromusername;

  // Change task status to 1
  task.set('status', 2);
  task.save();

  const replyContent = 'biu~谢谢你的反馈。正在为你寻找新的任务...';
  
  sendToUser.text(replyContent, data, accessToken);

  findAndSendNewTaskForUser(data, accessToken);
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
          sendToUser.task(task, data, accessToken);
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
          return createUserTranscript(user.get('open_id'), data.content, task);
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
          sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe1[order], userId, accessToken);
        }, 1000);
      });
    } else {
      user.set('status', 1);
      user.set('need_pay', true);
      user.save().then(user => {
        // Ask for wechat id
        sendToUser.text('么么哒，恭喜你完成了4个任务！\n请回复你的微信号（非微信昵称），稍后我们会将1元奖励发送给你！', data, accessToken);
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
    replyMessage += '1元红包正在向你招手！';
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
      sendToUser.image(wechatConfig.mediaId.image.rule, userId, accessToken).then(() => {
        // Send text
        const text = '么么哒~正确！恭喜你成功完成所有任务，1元红包正在向你招手！\n\n领取新的任务，请点击下方“领取任务”。注意，我们将开始对你的答案进行审核，如果正确率过低，会被拉入黑名单噢。';
        sendToUser.text(text, data, accessToken);
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
              sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe2[order], userId, accessToken);
            }, 1000);
          });
      });
    } else {
      user.set('status', -1);
      user.set('need_pay', true);
      user.save().then(user => {
        // Ask for wechat id
        sendToUser.text('锁定后的回复', data, accessToken);
      });
    }
  });
};

module.exports.getAccessToken = getAccessTokenFromCache;
// module.exports.findTaskForUser = findTaskForUser;
module.exports.findInProcessTaskForUser = findInProcessTaskForUser;

module.exports.postCtrl = (req, res, next) => {
  // Reply success to avoid error and repeated request
  res.send('success');

  const data = req.body.xml,
        userId = data.fromusername,
        Scene = leanCloud.AV.Object.extend('Scene');

  let scene;

  const accessTokenPromise = getAccessTokenFromCache();
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
  
    if (data.msgtype === 'text') {
      if (data.content === '网络测试') {
        sendToUser.text('网络测试成功', data, accessToken);
        logger.info('User testing connection:');
        logger.info(userId);
      } else if (data.content === '规则' && userStatus !== -205) {
        sendToUser.image(wechatConfig.mediaId.image.rule, userId, accessToken);
      } else {
        // Check status
        if (userStatus >= -304 && userStatus <= -300) {
          // First min tasks
          onFirstMin(data, accessToken, user);
        } else if (userStatus >= -206 && userStatus <= -200) {
          onSecondMin(data, accessToken, user);
        } else if (userStatus >= -104 && userStatus <= -100) {
          onThirdMin(data, accessToken, user);
        } else if (userStatus === 1) {
          // Waiting for WeChat ID
          onReceiveWeChatId(data, accessToken, user);
        } else if (userStatus === 2) {
          // Revoke mode
          onReceiveRevokeTranscription(data, accessToken, user);
        } else {
          // User status === 0
          if (data.content === '修改') {
            // Enter revoke mode
            onReceiveRevoke(data, accessToken, user);
            sendGA(userId, 'revoke');
          } else {
            findInProcessTaskForUser(userId).then(task => {
              if (task) {
                if (data.content === correctContent) {
                  onReceiveCorrect(data, accessToken, task);
                } else if (data.content === '没有语音') {
                  onReceiveNoVoice(data, accessToken, task);
                } else {
                  onReceiveTranscription(data, accessToken, task);
                }

                // GA: reply for task
                sendGA(userId, 'reply');
              }
            });
          }
        }
      }
    } else if (data.msgtype === 'event') {
      if (data.event === 'subscribe') {
        if (userStatus === -300) {
          onSubscribe(data, accessToken);
        }
      } else if (data.event === 'CLICK' && data.eventkey === 'GET_TASK') {
        // Check if the user has wechat_id recorded if the user has done more than 4 tasks
        if (userStatus === 0 && tasksDone >= 4 && !wechatId) {
          sendToUser.text('请回复你的微信号（非微信昵称），否则不能给你发红包噢！\n\n微信号登记完成后，继续领取任务，请点击“领取任务”', data, accessToken);

          // Change user status to 1
          user.set('status', 1);
          user.save();
        } else if (userStatus === 0) {
          onGetTask(data, accessToken);
        } else if (userStatus === 1) {
          sendToUser.text('biu~正在登记微信号，无法领取任务。请先回复你的微信号噢。');
        } else if (userStatus === 2) {
          sendToUser.text('biu~正在修改模式中，无法领取任务。可直接回复修改后的内容或者回复“0”退出修改模式。', data, accessToken);
        } else if (userStatus >= -104 && userStatus <= -100) {
          sendToUser.text(savedContent.thirdMin[-100 - userStatus], data, accessToken)
            .then(() => {
              sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe2[-100 - userStatus], userId, accessToken);
            });
        } else if (userStatus === -1) {
          sendToUser.text('biu~我们正在审核你的答案。请耐心等待通知噢！', data, accessToken);
        } else {
          // User has not finished the first 3 mins
          sendToUser.text('biu~尚未解锁“领取任务”功能。请先完成当前步骤噢。', data, accessToken);
        }
      } else if (data.event === 'SCAN') {
        // onQRCodeScanned(data, accessToken, res);
      }
    }
  });
};

module.exports.getCtrl = (req, res, next) => {
  res.send(req.query.echostr);
};
