'use strict';

const request = require('request'),
      exec = require('child_process').exec,
      fs = require('fs'),
      leanCloud = require('../lib/lean_cloud'),
      LeanCloud = leanCloud.AV,
      WeChatUser = LeanCloud.Object.extend('WeChatUser'),
      UserTranscript = LeanCloud.Object.extend('UserTranscript'),
      CrowdsourcingTask = LeanCloud.Object.extend('CrowdsourcingTask'),
      xml = require('xml'),
      datetime = require('../lib/datetime'),
      logger = require('../lib/logger'),
      wechatConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).wechat,
      wechatData = require('../static/wechat_data.json'),
      Tasks = wechatData.tasks,
      gaConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).ga,
      redisClient = require('../redis_client'),
      wechatLib = require('../lib/wechat'),
      compare = require('../lib/compare_transcript'),
      wechatPay = require('../lib/wechat_pay');

const taskTimers = {};

const getTime = (startedAt) => {
  return (new Date() - startedAt) + ' ms';
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
//   const Scene = LeanCloud.Object.extend('Scene'),
//         query = new LeanCloud.Query('Scene'),
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
//         query = new LeanCloud.Query('Scene');

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
  voice(transcript, data, accessToken, user) {
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
            wechatLib.logError(`--- At ${getTime(_startedAt)} exec error`, error);
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
                      wechatLib.logError('upload split media 2 failed', err);
                    });
                  });
                });
              }, err => {
                wechatLib.logError('upload split media 1 failed', err);
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
                wechatLib.logError('upload media failed', err);
              });
          }
        });
    }, err => {
      wechatLib.logError('voice message ws', err);
    });

    // Save the audio to local
    request(audioURL, (err, res, body) => {
      logger.info(`--- At ${getTime(_startedAt)} request audio URL:`);
      logger.info(audioURL);
      if (err) {
        self.text('biu~抱歉，获取语音出现问题，请回复“没有语音”，系统会为你准备新的任务。', data, accessToken);
        wechatLib.logError('request audio error', err);
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
          wechatLib.logError('upload media failed', err);
        });
    }, err => {
      wechatLib.logError('voice message ws', err);
    });

    // Save the audio to local
    request(audioURL, (err, res, body) => {
      logger.info(`--- At ${getTime(_startedAt)} request audio URL:`);
      logger.info(audioURL);
      if (err) {
        self.text('biu~抱歉，获取语音出现问题。', data, accessToken);
        wechatLib.logError('request audio error', err);
      }
    }).pipe(ws);
  },
  // Send voice and text to the user
  task(task, data, accessToken, user) {
    // get Transcript or UserTranscript
    const type = task.get('fragment_type'),
          fragmentId = task.get('fragment_id'),
          query = new LeanCloud.Query(type),
          self = this,
          _startedAt = data._startedAt;
    return query.get(fragmentId).then(transcript => {
      // This transcript can be Transcript or UserTranscript
      logger.info(`--- At ${getTime(_startedAt)} find transcript with id : ${fragmentId}`);
      if (transcript) {
        const content = type === 'Transcript' ? transcript.get('content_baidu')[0] : transcript.get('content');
        // Send check-list tip
        self.listTip(data, accessToken, user);
        // Send text and voice
        self.text(content, data, accessToken);
        self.voice(transcript, data, accessToken, user);
      } else {
        // Should not get here because error occurs when query by id cannot find object
        logger.info('Did not find transcript with id: ');
        logger.info(fragmentId);
        return self.text('对不起，系统错误，请联系管理员。', data, accessToken);
      }
    }, err => {
      wechatLib.logError('failed getting transcript when sending task', err);
      logger.info(`--- At ${getTime(_startedAt)} error: find transcript with id : ${fragmentId}`);
      task.destroy().then(success => {
        findAndSendNewTaskForUser(data, accessToken, user);
      }, err => {
        wechatLib.logError('failed destroying task', err);
      });
    });
  },
  schoolTask(order, data, accessToken, user) {
    const self = this,
          sendTip = !(user && user.get('preference') && user.get('preference').disableTip) && order >= 24,
          tipDelay = 1000;
    let textDelay = 1000,
        voiceDelay = 2000;
    if (sendTip) {
      setTimeout(() => {
        self.text(wechatData.tips.list, data, accessToken);
      }, tipDelay);
      textDelay = 2000;
      voiceDelay = 3000;
    }
    setTimeout(() => {
      self.text(Tasks['_' + order].text, data, accessToken);
    }, textDelay);
    setTimeout(() => {
      self.voiceByMediaId(wechatConfig.mediaId.voice.tasks['_' + order], data.fromusername, accessToken, data._startedAt);
    }, voiceDelay);
  },
  // Send check-list tip
  listTip(data, accessToken, user) {
    const self = this,
          disableTip = user.get('preference') && user.get('preference').disableTip;
    if (!disableTip) {
      return self.text(wechatData.tips.list, data, accessToken);
    } else {
      return Promise.resolve(false);
    }
  },
  // 发红包
  redPacket(userId, yuan, callback) {
    const data = {
            re_openid: userId,
            total_amount: yuan * 100
          },
          _callback = ret => {};
    callback = callback || _callback;
    wechatPay.sendMoney(data, callback);
  }
};

const createUser = userId => {
  const weChatUser = new WeChatUser();
  weChatUser.set({
    open_id: userId,
    tasks_done: 0,
    status: 0,
    price: 0.5,
    amount_paid: 0,
    need_pay: false,
    role: 'B',
    wrong_words: 0,
    red_packet: 0
  });
  return weChatUser.save();
};

const onSubscribe = (data, accessToken) => {
  const userId = data.fromusername;
  // Send image of introduction
  sendToUser.image(wechatConfig.mediaId.image.subscribe, userId, accessToken, data._startedAt).then(() => {
    // Send first task
    setTimeout(() => {
      sendToUser.text(Tasks._1.text, data, accessToken);
    }, 2000);
    setTimeout(() => {
      sendToUser.voiceByMediaId(wechatConfig.mediaId.voice.subscribe1[0], userId, accessToken, data._startedAt);
    }, 3000);
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
      const query = new LeanCloud.Query('CrowdsourcingTask');
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
    wechatLib.logError('assign task error', err);
  });
};

const isTaskValid = (task, _startedAt) => {
  const type = task.get('fragment_type'),
        id = task.get('fragment_id'),
        query = new LeanCloud.Query(type);

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
  const userId = data.fromusername,
        tasksDone = user.get('tasks_done');
  if (tasksDone === 0) {
    // 技能卡片-1
    sendToUser.image(wechatConfig.mediaId.image.skills[1], userId, accessToken, data._startedAt);
    setTimeout(() => {
      const content = '哇咔咔~恭喜你获得了第一张强大的技能卡，回复“XX”即可开启这个功能。';
      sendToUser.text(content, data, accessToken);
    }, 2000);
    setTimeout(() => {
      sendToUser.text(wechatData['Q&A'].pay, data, accessToken);
    }, 3000);
    user.set('status', 3);
    user.save();
  } else {
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
  }
};

const onGetTaskForB = (data, accessToken, user) => {
  const status = user.get('status');
  if (status === 1.5) {
    sendToUser.text('biu~正在登记微信号，无法领取任务。请先回复你的微信号噢。', data, accessToken);
  } else if (status === 3.5) {
    const content = '请认真阅读上面文字，然后回复“1”即可参与令人期待的新手训练营。';
    sendToUser.text(content, data, accessToken);
  } else if (status === 13.5 || status === 22.5) {
    sendToUser.text('biu~请先回答问题噢。', data, accessToken);
  } else {
    // Send current task
    sendToUser.schoolTask(status + 1, data, accessToken, user);
  }
};

// Find a task the user is working on
const findInProcessTaskForUser = userId => {
  const query = new LeanCloud.Query('CrowdsourcingTask');
  query.equalTo('user_id', userId);
  query.equalTo('status', 0);
  return query.first();
};

// userId:  user who created content
// content: text content
// task: task user was doing to create this userTranscript
// transcript: transcript from which the task was created
const createUserTranscript = (user, content, task, transcript) => {
  const type = task.get('fragment_type'),
        userId = user.get('open_id'),
        userRole = user.get('role'),
        userTranscript = new UserTranscript(),
        needContent = content === '0';
  let lastReviewTimes;
  if (transcript) {
    lastReviewTimes = transcript.get('review_times') || 0;
  } else {
    lastReviewTimes = 0;
  }
  userTranscript.set('user_role', userRole);
  userTranscript.set('media_id', task.get('media_id'));
  userTranscript.set('fragment_order', task.get('fragment_order'));
  userTranscript.set('user_open_id', userId);
  if (!needContent) userTranscript.set('content', content);
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
      wechatLib.logError('failed getMachineTranscript', err);
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
        tasksDone = user.get('tasks_done');
  // Change task status to 1
  task.set({
    status: 1,
    completed_at: new Date()
  });
  task.save();

  // Add 1 to user's tasks done
  user.set('tasks_done', tasksDone + 1);
  user.save().then(user => {
    const tasksDone = user.get('tasks_done');
    logger.info(`--- At ${getTime(data._startedAt)} completeTaskAndReply / 获取完成任务数量 userId : ${userId} / 完成数量: ${tasksDone}`);
    // Check for tasks done
    if ([4, 8, 12].indexOf(tasksDone) !== -1) {
      const skillCardOrder = tasksDone / 4 + 1;
      sendToUser.image(wechatConfig.mediaId.image.skills[skillCardOrder], userId, accessToken, data._startedAt);
      let content = '哇咔咔~恭喜你获得了一张强大的技能卡，回复“';
      if (skillCardOrder === 2) {
        content += '修改';
      } else if (skillCardOrder === 3) {
        content += '过';
      } else {
        content += '前”or“后';
      }
      content += '”即可开启这个功能。';
      setTimeout(() => {
        sendToUser.text(content, data, accessToken);
      }, 2000);

      user.set('status', 3);
      user.save();

      if (tasksDone === 8 || tasksDone === 12) {
        setTimeout(() => {
          findAndSendNewTaskForUser(data, accessToken, user);
        }, 3000);
      }
    } else {
      findAndSendNewTaskForUser(data, accessToken, user);
    }
  });
};

const onReceiveTranscription = (data, accessToken, task, user) => {
  const userId = data.fromusername,
        content = data.content,
        hasXX = content.match(/xx/gi),
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
      createUserTranscript(user, content, task, transcript).then(userTranscript => {
        if (userTranscript) {
          if (userRole === '帮主' && hasXX) {
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
        wechatLib.logError('createUserTranscript', err);
      });
    });
  });
};

// Find last completed task for user
const findLastTaskForUser = userId => {
  const query = new LeanCloud.Query('CrowdsourcingTask');
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
    let query = new LeanCloud.Query('CrowdsourcingTask');
    const source = options.source || 0;
    if (source) {
      query.greaterThan('source', source[0]);
      query.lessThan('source', source[1]);
    } else {
      query.equalTo('source', source);
      const queryNoSource = new LeanCloud.Query('CrowdsourcingTask');
      queryNoSource.doesNotExist('source');
      query = LeanCloud.Query.or(query, queryNoSource);
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
  if (userRole === '帮主') {
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
          wechatLib.logError('failed destroying task', err);
        });
      });
    } else {
      return task;
    }
  });
};

// const findNextTaskForUser = (userId, task) => {
//   const query = new LeanCloud.Query('CrowdsourcingTask');
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
  const query = new LeanCloud.Query('WeChatUser');
  query.equalTo('open_id', userId);
  return query.first();
};

const onReceiveWeChatId = (data, accessToken, user) => {
  const content = data.content;
  if (content === '1') {
    // Change user status
    user.set('status', 0);
    user.save().then(user => {
      logger.info(`--- At ${getTime(data._startedAt)} onReceiveWeChatId / set status 0 `);
      sendToUser.text('微信号登记成功！', data.fromusername, accessToken, data._startedAt)
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
        query = new LeanCloud.Query(type);
  return query.get(id);
};

// Get the relavent machine transcript from a task
const getMachineTranscript = task => {
  const type = task.get('fragment_type');

  if (type === 'Transcript') {
    return getTranscript(task);
  } else {
    // type === 'UserTranscript'
    const query = new LeanCloud.Query('Transcript');
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
      wechatLib.logError('failed sending GA', error);
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

const findUserTranscriptFromTaskByUser = (task, userId) => {
  const query = new LeanCloud.Query('UserTranscript');
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
            sendToUser.voice(transcript, data, accessToken, user);
          });
        } else {
          // No user's content
          sendToUser.task(task, data, accessToken, user);
        }
      });
    }, err => {
      wechatLib.logError('failed getting last task in revoke mode', err);
    });
  }, err => {
    wechatLib.logError('failed saving user when entering revoke mode', err);
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
            return createUserTranscript(user, data.content, task, transcript);
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

const setPrice = (data, user) => {
  const sceneId = +(data.eventkey.replace('qrscene_', '')),
        price = sceneId / 10;
  user.set('price', price);
  user.save().then(user => {
    logger.info('Price setted for open_id:');
    logger.info(user.get('open_id'));
  }, err => {
    wechatLib.logError('failed setting price', err);
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
        query = new LeanCloud.Query('Transcript'),
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
  if (userRole === '帮主') {
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

// Return user object
const ruleTeaching = (data, accessToken, user, obj) => {
  const ruleArray = [9, 11, 17, 20],
        status = obj.status,
        delay = obj.delay,
        isCorrect = obj.isCorrect,
        userWrongWords = obj.userWrongWords,
        redPacket = obj.redPacket,
        currentTaskOrder = status + 1,
        nextTaskOrder = currentTaskOrder + 1,
        userId = data.fromusername,
        startedAt = data._startedAt,
        sendRedPacket = redPacket === 8;
  let content, redPacketDelay;

  content = `【任务完成：${currentTaskOrder - 4}/24】\n`;
  if (userWrongWords > 0) content += `【错别字总数：${userWrongWords}】\n`;
  content += `【红包奖励：${redPacket}/8元】\n\n`;

  if (isCorrect) {
    content += '恭喜你成功修炼一项字幕技能，欢迎修炼下一难度的技能！（么么哒）\n\n';
  } else {
    content += '不好意思，该片段错误，无红包奖励，你已成功修炼一项字幕技能，欢迎修炼下一难度的技能！（么么哒）\n\n';
  }

  // 你的技能
  if (currentTaskOrder === 9) content += '你的技能：\n1）无错别字\n2）感叹词';
  if (currentTaskOrder === 11) content += '你的技能：\n1）无错别字\n2）感叹词\n3）语气词';
  if (currentTaskOrder === 14) content += '你的技能：\n1）无错别字\n2）感叹词\n3）语气词\n4）重复、口误';
  if (currentTaskOrder === 17) content += '你的技能：\n1）语意（感叹词、语气词、重复口误）\n2）他她它';
  if (currentTaskOrder === 20) content += '你的技能：\n1）语意（感叹词、语气词、重复口误）\n2）他她它\n3）的地得';
  if (currentTaskOrder === 23) content += '你的技能：\n1）语意（感叹词、语气词、重复口误）\n2）他她它\n3）的地得\n4）数字';
  setTimeout(() => {
    sendToUser.text(content, data, accessToken);
  }, delay);

  if (sendRedPacket) {
    setTimeout(() => {
        // sendToUser.redPacket(userId, 1);
        sendToUser.text('*此处应有1元红包*', data, accessToken);
    }, 1000 + delay);
    redPacketDelay = 1000;
  } else {
    redPacketDelay = 0;
  }

  if (ruleArray.indexOf(currentTaskOrder) !== -1) {
    // Send rule image
    setTimeout(() => {
      let ruleOrder = 3;
      if (currentTaskOrder !== 9) ruleOrder = (currentTaskOrder + 1) / 3;
      sendToUser.image(wechatConfig.mediaId.image.rule['_' + ruleOrder], userId, accessToken, startedAt)
        .then(() => {
          sendToUser.schoolTask(nextTaskOrder, data, accessToken, user);
        });
    }, 1000 + delay + redPacketDelay);
  } else {
    // currentTaskOrder === 14 or 23
    user.set('status', status + 0.5);
    // 回顾与总结
    setTimeout(() => {
      if (currentTaskOrder === 14) {
        content = '【回顾与总结】\n\n恭喜你成功修炼了4种不同的字幕技能，其实它们都在告诉你一个字幕原则：如何判断一部分文字是否应该被删掉？\n\n你只需要记住一点即可：\n\n如果一部分文字在【语意】上没有贡献，就应该被删除掉。';
      } else {
        content = '【回顾与总结】\n\n目前为止你总共掌握了7项技能，“快速掌握它们的秘诀是什么？”，你只需要记住一点即可：\n【语意】\n【语意】\n【语意】\n\n字幕是一件极为严谨的表达，它是严格基于【语意】来进行修改的，所以你只需要记住你修改的唯一原则是【语意】即可。';
      }
      sendToUser.text(content, data, accessToken);
    }, 1000 + delay + redPacketDelay);
    // 问题
    setTimeout(() => {
      if (currentTaskOrder === 14) {
        content = '【问】为了提高准确率，修改完一个句子后，应该做什么？\n\n1.通过【语意】再检查一遍，判断它是否有贡献\n2.相信自己，不用管了\n\n（回复数字“1”or“2”即可）';
      } else {
        content = '【问】字幕里修改的最根本原则是什么？\n\n1.无错别字\n2.感叹词\n3.语气词\n4.重复口误\n5.他她它\n6.的地得\n7.数字\n8.语意\n\n（回复数字“1”、“2”...即可）';
      }
      sendToUser.text(content, data, accessToken);
    }, 2000 + delay + redPacketDelay);
  }

  return user;
};

const onReceiveFromB = (data, accessToken, user) => {
  const status = user.get('status'),
        lastWrongWords = user.get('last_wrong_words') || 0,
        currentTaskOrder = status + 1,
        currentTask = Tasks['_' + currentTaskOrder],
        nextTaskOrder = currentTaskOrder + 1,
        nextTask = Tasks['_' + nextTaskOrder],
        startedAt = data._startedAt,
        userId = data.fromusername,
        userContent = data.content,
        userTranscript = new UserTranscript(),
        failContent = 'I’ll fail and fail again until I succeed(我将持续失败直到成功！）\n\n你的回答错误，请仔细回顾图片规则，再次回答。',
        userTranscriptObj = {
          media_id: `training`,
          content: userContent,
          fragment_order: currentTaskOrder,
          user_open_id: userId,
          review_times: 0,
          user_role: 'B'
        },
        skillGotArray = [9, 11, 14, 17, 20, 23],
        ruleArray = [9, 11, 17, 20];
  let content, delay,
      redPacket = user.get('red_packet') || 0,
      userWrongWords = user.get('wrong_words') || 0,
      amountPaid = user.get('amount_paid') || 0;

  if (status === 1.5) {
    if (userContent === '1') {
      // Change user status
      user.set('status', 2);
      user.save().then(user => {
        logger.info(`--- At ${getTime(startedAt)} onReceiveWeChatId / set status 2 `);
        sendToUser.image(wechatConfig.mediaId.image.xiaozhushou, userId, accessToken, startedAt)
          .then(() => {
            sendToUser.schoolTask(3, data, accessToken);
          });
      });
    } else {
      // Save WeChatId, ask for confirmation
      user.set('wechat_id', content);
      user.save().then(user => {
        logger.info(`--- At ${getTime(startedAt)} onReceiveWeChatId / set wechat_id :${userContent}`);
        sendToUser.text(`微信号：${userContent}。确认请回复1，修改请回复新的微信号。`, data, accessToken);
      });
    }
  } else if (status <= 3) {
    // 前4个任务，不判断正确
    // Create UserTranscript        
    userTranscript.set(userTranscriptObj);
    userTranscript.save().then(userTranscript => {
      if (status === 3 || status === 1) {
        user.set('status', status + 0.5);
      } else {
        user.set('status', status + 1);
      }
      user.set('red_packet', redPacket + 1);
      user.save().then(user => {
        if (status === 1) {
          content = '么么哒，请回复你的微信号（非微信昵称），在接下来的任务里，你可能会遇到各种各样的问题，我们的小助手将通过微信来协助你。';
        } else if (status === 3) {
          content = '【1\'61是干什么？】\n\n我们来自硅谷斯坦福大学，是一家以人工智能驱动的语音识别初创企业，因为我们的机器只能正确翻译90%的语音，所以我们将机器翻译错误的部分（10%）通过众包的形式分发给大家进行人工校对。\n\n目前，我们主要为各大教育视频机构做字幕，你修改的每一条文字都将直接呈现在各大教育视频网站里，让数千万的学生看见。';
        } else {
          content = `【红包奖励：${currentTaskOrder}/8元】\n【离进入新手学院还有${4 - currentTaskOrder}个片段】\n\nbiu~我已经收到你的文字啦，集满1元将发送红包给你，快来挑战下一个片段吧！`;
        }
        sendToUser.text(content, data, accessToken).then(() => {
          if (status === 3) {
            setTimeout(() => {
              content = '【新手学院：字幕达人】\n\n尽管看似不可能，但我们还是将在接下来的6分钟任务里让你成为一名高段位的字幕达人！\n\n总计6分钟，24个语音片段，3元现金红包奖励（每满1.0元发送），还有一封毕业证书。\n\n1.答错一个片段，该片段将没有奖励；\n2.如果总的错别字数超过10个字，将无法毕业，无法开通领取语音任务；\n\n同意请回复“1”，即可继续。';
              sendToUser.text(content, data, accessToken);
            }, 1000);
            // 礼物图片
            setTimeout(() => {
              sendToUser.image(wechatConfig.mediaId.image.gift, userId, accessToken, startedAt);
            }, 2000);
          } else if (status !== 1) {
            sendToUser.schoolTask(nextTaskOrder, data, accessToken);
          }
        });
      });
    });
  } else if (status === 3.5) {
    // 回复"1"开始新手学院
    if (userContent === '1') {
      // Change user status
      user.set('status', 4);
      user.save().then(user => {
        // 规则图片-1
        sendToUser.image(wechatConfig.mediaId.image.rule._1, userId, accessToken, startedAt)
          .then(() => {
            // Task 5
            setTimeout(() => {
              sendToUser.schoolTask(5, data, accessToken);
            }, 1000);
          });
      });
    } else {
      content = '请认真阅读上面文字，然后回复“1”即可参与令人期待的新手训练营。';
      sendToUser.text(content, data, accessToken);
    }
  } else if (status === 13.5) {
    if (userContent === '1') {
      // Change user status
      user.set('status', 14);
      user.save().then(user => {
        sendToUser.text('恭喜你，你的回答是正确的。', data, accessToken);
        setTimeout(() => {
          // 规则图片-5
          sendToUser.image(wechatConfig.mediaId.image.rule._5, userId, accessToken, startedAt)
            .then(() => {
              // Task 15
              sendToUser.schoolTask(15, data, accessToken);
            });
        }, 1000);
      });
    } else {
      content = '不好意思，请再思考，重新选择。';
      sendToUser.text(content, data, accessToken);
    }
  } else if (status === 22.5) {
    if (userContent === '8') {
      // Change user status
      user.set('status', 23);
      user.save().then(user => {
        content = '恭喜你，你的回答是正确的。下面将会有5道综合题来训练你对【语意】的掌握情况，加油！';
        sendToUser.text(content, data, accessToken).then(() => {
          // Task 24
          sendToUser.schoolTask(24, data, accessToken, user);
        });
      });
    } else {
      content = '不好意思，请再思考，重新选择。';
      sendToUser.text(content, data, accessToken);
    }
  } else if (status <= 27) {
    // Task 5-28
    const userTotalWords = compare.getTotalWords(userContent),
          correctTotalWords = compare.getTotalWords(currentTask.correct),
          wrongWords = compare.diffWordsWithoutXX(userTotalWords, correctTotalWords),
          isCorrect = wrongWords === 0;
    let objForRuleTeaching = {
          status,
          delay: 0,
          isCorrect,
          userWrongWords,
          redPacket
        };

    if (isCorrect) {
      user.set('status', status + 1);

      redPacket += 1;
      objForRuleTeaching.redPacket = redPacket;
      const sendRedPacket = redPacket === 8;
      content = `【任务完成：${currentTaskOrder - 4}/24】\n【红包奖励：${redPacket}/8元】\n\n`;
      
      if (currentTaskOrder === 5) {
        content += '恭喜你，你的答案是正确的！';
        sendToUser.text(content, data, accessToken).then(() => {
          sendToUser.schoolTask(nextTaskOrder, data, accessToken, user);
        });
      } else if (currentTaskOrder === 6) {
        content += '恭喜你成功修炼一项字幕技能，欢迎修炼下一难度的技能！（么么哒）';
        sendToUser.text(content, data, accessToken);
        setTimeout(() => {
          content = '你的技能：\n1）无错别字';
          sendToUser.text(content, data, accessToken);
        }, 1000);
        setTimeout(() => {
          sendToUser.image(wechatConfig.mediaId.image.rule._2, userId, accessToken, startedAt)
            .then(() => {
              sendToUser.schoolTask(nextTaskOrder, data, accessToken, user);
            });
        }, 2000);
      } else if (skillGotArray.indexOf(currentTaskOrder) !== -1) {
        // 穿插规则教学
        user = ruleTeaching(data, accessToken, user, objForRuleTeaching);
      } else {
        // currentTaskOrder === 7 - 28, no 规则教学
        content = `【任务完成：${currentTaskOrder - 4}/24】\n`;
        if (userWrongWords > 0) content += `【错别字总数：${userWrongWords}】\n`;
        content += `【红包奖励：${redPacket}/8元】\n\n恭喜你，你的答案是正确的！`;
        sendToUser.text(content, data, accessToken);

        if (sendRedPacket) {
          setTimeout(() => {
              // sendToUser.redPacket(userId, 1);
              sendToUser.text('*此处应有1元红包*', data, accessToken);
          }, 1000);
          delay = 2000;
        } else {
          delay = 0;
        }

        if (currentTaskOrder === 28) {
          user.set({status: 0, role: 'A'});

          setTimeout(() => {
            content = '恭喜你成为1\'61新手学院的毕业生，你已被开通“领取任务”功能。\n\n乔布斯曾经说过，“细节至关重要，它值得被耐心等待。”\n\n希望，在接下来的任务中，你能够耐心一点，也希望这份耐心能浸透到你的生活之中，带去积极的影响。\n\n现在赠送你一页毕业证书，欢迎分享证书邀请更多的朋友参加这次“耐心修炼”之旅。';
            sendToUser.text(content, data, accessToken);
          }, 1000 + delay);
          // 毕业证书
          setTimeout(() => {
            sendToUser.image(wechatConfig.mediaId.image.certificate, userId, accessToken, startedAt);
          }, 2000 + delay);
          setTimeout(() => {
            content = '【1\'61毕业宣言】\n“只有那些相信能带去改变的人才会拥有改变”\n\n作为1\'61的毕业生，我们对你的第一个要求就是：相信自己改变的力量，接下来你将开启真正有趣的1\'61探索征程。\n\n在未来的任务中，你会随机得到各种各样技能卡片，每一张技能卡片上都印有一位人类历史上最伟大的科学家，他们推动着物理、化学、生物等多个领域的变革，促进71亿人口的进步。总计36张卡片，36项技能，36位顶尖科学家。集满还会有1000元现金奖励。\n\n我们希望这些科学家的不墨守陈规、敢于挑战、持续不断的努力等等特质能够激励你更好地前行。';
            sendToUser.text(content, data, accessToken);
          }, 3000 + delay);
          setTimeout(() => {
            content = '现在你已经被开通“领取任务”功能，点击下方“领取任务”开启探索之旅吧。\n\n（同时，接下来的音频都会切分为2个短片段，提高你的改错别字效率。）';
            sendToUser.text(content, data, accessToken);
          }, 4000 + delay);
        } else {
          setTimeout(() => {
            sendToUser.schoolTask(nextTaskOrder, data, accessToken, user);            
          }, delay);
        }
      }

      if (redPacket === 8) {
        // Reset red_packet to 0
        redPacket = 0;
        // Add 1 to amount_paid
        amountPaid += 1;
      }

      user.set({red_packet: redPacket, amount_paid: amountPaid});
      user.save();
    }

    // Create UserTranscript
    userTranscript.set(userTranscriptObj);
    userTranscript.save().then(userTranscript => {
      if (!isCorrect) {
        userWrongWords += wrongWords;
        objForRuleTeaching.userWrongWords = userWrongWords;

        // Get answer times
        const query = new LeanCloud.Query('UserTranscript');
        query.equalTo('media_id', 'training');
        query.equalTo('fragment_order', currentTaskOrder);
        query.equalTo('user_open_id', userId);
        query.equalTo('review_times', 0);
        query.equalTo('user_role', 'B');
        query.count().then(count => {
          if (count === 1) {
            sendToUser.text(failContent, data, accessToken).then(() => {
              sendToUser.schoolTask(currentTaskOrder, data, accessToken, user);
            });
          } else if (count === 2) {
            if (currentTaskOrder === 5 || currentTaskOrder === 6) {
              content = '这段文字是正确的，所以你只需要复制粘贴机器给出的文字就好啦。';
              sendToUser.text(content, data, accessToken);
            } else {
              content = '【提示】\n\n下面提示图片里标明了这道题错误的地方，只有红色的地方是有错误的，非标红的地方没有错误。\n\n1.如果你修改了非红色部分，请改回来。\n2.如果红色部分你没有发现错误，请努力寻找错误。\n\n注意：你只剩1次机会修改这个片段，将计入你的错别字字数。';
              sendToUser.text(content, data, accessToken);
              // Send hint image
              setTimeout(() => {
                sendToUser.image(wechatConfig.mediaId.image.hint[currentTaskOrder], userId, accessToken, startedAt);
              }, 1000);
            }
          } else {
            // count >= 3
            if (currentTaskOrder === 5 || currentTaskOrder === 6) {
              content = '这段文字是正确的，所以你只需要复制粘贴机器给出的文字就好啦。';
              sendToUser.text(content, data, accessToken);
            } else {
              // Task 7 - 28
              user.set('wrong_words', userWrongWords);

              if (userWrongWords > 10) {
                content = '非常遗憾，你的错误字数已经大于10，暂时无法进行新手训练营测试，如果想要申诉，回复“申诉”即可。';
                sendToUser.text(content, data, accessToken);
                user.set('status', -1);
              } else {
                // wrong words < 10
                if (currentTaskOrder === 28) {
                  user.set({status: 0, role: 'A'});
                } else {
                  user.set('status', status + 1);
                }

                // Send answer image
                sendToUser.image(wechatConfig.mediaId.image.answers[currentTaskOrder], userId, accessToken, startedAt);

                if (skillGotArray.indexOf(currentTaskOrder) !== -1) {
                  objForRuleTeaching.delay = 1000;
                  user = ruleTeaching(data, accessToken, user, objForRuleTeaching);
                } else {
                  // Task 7 - 28, no 规则教学
                  setTimeout(() => {
                    content = `【任务完成：${currentTaskOrder - 4}/24】\n【错别字总数：${userWrongWords}】\n【红包奖励：${redPacket}/8元】\n\n腻害，该片段视为错误无红包，很欣赏你的性格，真正的勇士敢于直面惨淡的人生。请认真阅读上面参考答案。`;
                    sendToUser.text(content, data, accessToken);
                  }, 1000);

                  if (currentTaskOrder === 28) {
                    setTimeout(() => {
                      content = '恭喜你成为1\'61新手学院的毕业生，你已被开通“领取任务”功能。\n\n乔布斯曾经说过，“细节至关重要，它值得被耐心等待。”\n\n希望，在接下来的任务中，你能够耐心一点，也希望这份耐心能浸透到你的生活之中，带去积极的影响。\n\n现在赠送你一页毕业证书，欢迎分享证书邀请更多的朋友参加这次“耐心修炼”之旅。';
                      sendToUser.text(content, data, accessToken);
                    }, 2000);
                    // 毕业证书
                    setTimeout(() => {
                      sendToUser.image(wechatConfig.mediaId.image.certificate, userId, accessToken, startedAt);
                    }, 3000);
                    setTimeout(() => {
                      content = '【1\'61毕业宣言】\n“只有那些相信能带去改变的人才会拥有改变”\n\n作为1\'61的毕业生，我们对你的第一个要求就是：相信自己改变的力量，接下来你将开启真正有趣的1\'61探索征程。\n\n在未来的任务中，你会随机得到各种各样技能卡片，每一张技能卡片上都印有一位人类历史上最伟大的科学家，他们推动着物理、化学、生物等多个领域的变革，促进71亿人口的进步。总计36张卡片，36项技能，36位顶尖科学家。集满还会有1000元现金奖励。\n\n我们希望这些科学家的不墨守陈规、敢于挑战、持续不断的努力等等特质能够激励你更好地前行。';
                      sendToUser.text(content, data, accessToken);
                    }, 4000);
                    setTimeout(() => {
                      content = '现在你已经被开通“领取任务”功能，点击下方“领取任务”开启探索之旅吧。\n\n（同时，接下来的音频都会切分为2个短片段，提高你的改错别字效率。）';
                      sendToUser.text(content, data, accessToken);
                    }, 5000);
                  } else {
                    setTimeout(() => {
                      sendToUser.schoolTask(nextTaskOrder, data, accessToken, user);            
                    }, 1000);
                  }
                }
              }
              user.save();
            }
          }
        });
      }
    });
  }
};

const cancelListTip = (data, accessToken, user) => {
  const preference = user.get('preference') || {};
  preference.disableTip = true;
  user.set('preference', preference);
  user.save().then(user => {
    const content = '已取消提示，请继续任务。';
    sendToUser.text(content, data, accessToken);
  });
};

module.exports.postCtrl = (req, res, next) => {
  // Reply success to avoid error and repeated request
  res.send('success');

  const data = req.body.xml,
        userId = data.fromusername,
        Scene = LeanCloud.Object.extend('Scene');

  let scene;

  const startedAt = new Date();
  data._startedAt = startedAt;
  logger.info(`--- At ${startedAt} get user ${userId} response`);

  const accessTokenPromise = wechatLib.getAccessTokenFromCache(undefined, startedAt);
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
          userRole = user.get('role') || 'B',
          userStatus = user.get('status'),
          wechatId = user.get('wechat_id'),
          tasksDone = user.get('tasks_done');
    let order, content;

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
        sendToUser.image(wechatConfig.mediaId.image.rule.all, userId, accessToken, startedAt);
        sendGA(userId, 'rule');
      } else if (data.content === '取消') {
        // 取消任务音频后5点提醒
        cancelListTip(data, accessToken, user);
      } else if (data.content === '申诉') {
        sendToUser.image(wechatConfig.mediaId.image.complain, userId, accessToken, startedAt);
      } else {
        // Check role
        if (userRole === 'C') {
          // TODO
        } else if (userRole === 'B') {
          if (userStatus !== -1) {
            onReceiveFromB(data, accessToken, user);
          }
        } else {
          // A, 帮主, 工作人员, B端用户
          // Check user status
          if (userStatus === 3) {
            let correctReply = false;
            if (tasksDone === 0) {
              // 技能卡片-1，需要回复“XX”
              if (data.content.match(/xx/gi)) {
                content = '恭喜你成功解锁该技能！';
                correctReply = true;
              } else {
                content = '请回复“XX”解锁技能，否则无法领取你第一个正式的音频任务啦。';
              }
              sendToUser.text(content, data, accessToken);
              if (correctReply) {
                user.set('status', 0);
                user.save().then(user => {
                  findAndSendNewTaskForUser(data, accessToken, user);
                });
              }
            } else if (tasksDone === 4) {
              // 技能卡片-2，需要回复“修改”
              if (data.content === '修改' ) {
                content = '恭喜你成功解锁该技能！';
                correctReply = true;
              } else {
                content = '请回复“修改”解锁技能，否则无法领取下一个任务啦。';
              }
              sendToUser.text(content, data, accessToken);
              if (correctReply) onReceiveRevoke(data, accessToken, user);
            } else if (tasksDone === 8) {
              // 技能卡片-3，需要回复“过”
              if (data.content === '过' ) {
                content = '恭喜你成功解锁该技能！已为你跳过了上一段片段！（上一个片段没有红包）';
                correctReply = true;
              } else {
                content = '请回复“过”解锁技能，否则无法领取下一个任务啦。';
              }
              sendToUser.text(content, data, accessToken);
              if (correctReply) {
                findInProcessTaskForUser(userId).then(task => {
                  onReceivePass(data, accessToken, task, user);
                });
                user.set('status', 0);
                user.save();
              }
            } else if (tasksDone === 12) {
              // 技能卡片-4，需要回复“前”或“后”
              if (data.content === '前' || data.content === '后') {
                content = '恭喜你成功解锁该技能！下面是你调用的音频片段，听完之后可以更好地帮助你找出上面音频片段的错别字。';
                correctReply = true;
              } else {
                content = '请回复“前”or“后”解锁技能，否则无法领取下一个任务啦。';
              }
              sendToUser.text(content, data, accessToken);
              if (correctReply) {
                findInProcessTaskForUser(userId).then(task => {
                  onReceivePrevNext(data, accessToken, task);                  
                });
                user.set('status', 0);
                user.save();
              }
            }
          } else if (userStatus === 1) {
            // Waiting for WeChat ID
            onReceiveWeChatId(data, accessToken, user);
            sendGA(userId, 'reply_wechat_id');
          } else if (userStatus === 2) {
            // Revoke mode
            onReceiveRevokeTranscription(data, accessToken, user);
            sendGA(userId, 'reply_revoke');
          } else {
            // User status === 0
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
                  // User status is 0
                  // User has no assigned task
                  if (tasksDone === 0) {
                    content = '请点击下方“领取任务”，开启1\'61探索之旅。';
                    sendToUser.text(content, data, accessToken);
                  }
                }
              });
            }
          }
        }
      }
    } else if (data.msgtype === 'event') {
      if (data.event === 'subscribe') {
        if (userRole === 'B' && userStatus === 0) {
          onSubscribe(data, accessToken);
          sendGA(userId, 'new_subscription');
        } else {
          sendGA(userId, 'return_subscription');
        }

        if (data.eventkey) {
          setPrice(data, user);
        }
      } else if (data.event === 'CLICK' && data.eventkey === 'GET_TASK') {
        if (userRole === 'C') {
          // TODO
        } else if (userRole === 'B') {
          if (userStatus !== -1) {
            onGetTaskForB(data, accessToken, user);
          }
        } else {
          // A, 帮主, 工作人员, B端用户
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
          } else if (userStatus === 3) {
            if (tasksDone === 0) {
              content = '请回复“XX”解锁技能，否则无法领取你第一个正式的音频任务啦。';
            } else if (tasksDone === 4) {
              content = '请回复“修改”解锁技能，否则无法领取下一个任务啦。';
            } else if (tasksDone === 8) {
              content = '请回复“过”解锁技能，否则无法领取下一个任务啦。';
            } else if (tasksDone === 12) {
              content = '请回复“前”或“后”解锁技能，否则无法领取下一个任务啦。';
            }
            sendToUser.text(content, data, accessToken);
          } else if (userStatus === -1) {
            sendToUser.text('biu~我们正在审核你的答案。请耐心等待通知噢！', data, accessToken);
          } else {
            // Should not get here
            logger.info('Error: need get task handler');
          }
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