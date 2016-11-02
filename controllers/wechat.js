'use strict';

const request = require('request'),
      fs = require('fs'),
      leanCloud = require('../lib/lean_cloud'),
      xml = require('xml'),
      datetime = require('../lib/datetime'),
      wechatConfig = require(`../config/${process.env.NODE_ENV || 'development'}.json`).wechat,
      redisClient = require('../redis_client');

const getAccessTokenFromWechat = () => {
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
  options = options || {};
  const name = 'wechat_access_token';

  return new Promise((resolve, reject) => {
    redisClient.get(name, (error, reply) => {
      if (error) {
        return reject(error);
      }

      if (reply && !options.updateCache) {
        console.log('hit the cache:', reply);
        resolve(reply);
      } else {
        getAccessTokenFromWechat().then(data => {
          // Add to cache
          redisClient.set(name, data.access_token, (err, ret) => {
            if (err) {
              console.log(err);
            } else {
              console.log('added to the cache');
            }
          });
          // Set redis expire time as 1min less than actual access token expire time
          redisClient.expire(name, data.expires_in - 60);

          console.log(data.access_token);
          resolve(data.access_token);
        }, err => reject(err));
      }
    });
  });
};

const createQRTicket = (scene, token) => {
  const actionName = 'QR_SCENE',
        expireSeconds = 604800; // 1 week

  return new Promise((resolve, reject) => {
    request.post({
      url: `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${token}`,
      json: true,
      body: {
        expire_seconds: expireSeconds,
        action_name: actionName,
        action_info: {
          scene: {scene_id: scene.get('sceneId')}
        }
      }
    }, (error, response, body) => {
      if (error) return reject(error);

      if (body.errcode) {
        reject(body);
      } else {
        resolve(body.ticket);
      }
    });
  });
};

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

const sendTemplateMessage = (toUser, data, templateId, token) => {
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`;
  return new Promise((resolve, reject) => {
    request.post({
      url,
      json: true,
      body: {
        template_id: templateId,
        touser: toUser,
        url: '',
        data: data
      }
    }, (error, response, body) => {
      if (error) { return reject(error); }
      if (body.errcode) {
        reject(body);
      } else {
        resolve(body);
      }
    });
  });

}

/**
 * @param  {Dict} data
 * @param  {String} data.tousername 开发者微信号
 * @param  {String} data.fromusername 接收QRcode的用户OpenID
 * @param  {String} data.content 将要创建的scene的eventName
 */
const sendQRCodeMessage = (data, token, res) => {
  const Scene = leanCloud.AV.Object.extend('Scene'),
        query = new leanCloud.AV.Query('Scene'),
        scene = new Scene();

  query.count()
    .then(count => {
      // Create the scene
      scene.set('creatorId', data.fromusername);
      scene.set('eventName', data.content);
      scene.set('sceneId', count + 1);

      // @fixme:
      // temp event time
      scene.set('eventTime', + new Date());
      return scene.save();
    })
    .then(scene => {
      // Create QR ticket
      return createQRTicket(scene, token);
    })
    .then(ticket => {
      console.log('ticket created:', ticket);

      const qrURL = `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${ticket}`,
            mediaSrc = `${global.APP_ROOT}/tmp/qr_${scene.id}.jpg`,
            ws = fs.createWriteStream(mediaSrc);

      ws.on('finish', () => {
        console.log('QR image saved in local');

        // Upload the QR image as media in Wechat
        uploadMedia(mediaSrc, 'image', token)
          .then(media => {
            console.log('media uploaded:');
            console.log(media);

            // Delete local QR image
            fs.unlink(mediaSrc);

            const object = {
              xml: [
                {ToUserName: {_cdata: data.fromusername}},
                {FromUserName: {_cdata: data.tousername}},
                {MsgType: {_cdata: 'image'}},
                {CreateTime: +new Date()},
                {Image: [{
                  MediaId: {_cdata: media.media_id}
                }]}
              ]
            };

            // Send the user the message containing the QR code
            //
            // <xml>
            // <ToUserName><![CDATA[toUser]]></ToUserName>
            // <FromUserName><![CDATA[fromUser]]></FromUserName>
            // <CreateTime>12345678</CreateTime>
            // <MsgType><![CDATA[image]]></MsgType>
            // <Image>
            // <MediaId><![CDATA[media_id]]></MediaId>
            // </Image>
            // </xml>
            res.set('Content-Type', 'text/xml');
            res.send(xml(object));
          });
      }, err => {
        console.log('upload media failed:', err);
      });

      // Save the QR image to local
      request(qrURL).pipe(ws);
    }, err => {
      console.log('ticket creation failed:', err);
    });
};

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
const onQRCodeScanned = (data, token, res) => {
  const scannerLimit = 3,
        sceneId = data.event === 'SCAN' ? +data.eventkey : +(data.eventkey.replace('qrscene_', '')),
        query = new leanCloud.AV.Query('Scene');

  let scanUsers;

  query.equalTo('sceneId', sceneId);

  console.log('scene id:', sceneId);

  // Use the scene id to get the scene
  query.first()
    .then(scene => {
      scanUsers = scene.get('scanUsers') || [];

      // If this is the first time the person scanned this QR code, add him into scanUsers
      if (scanUsers.indexOf(data.fromusername) === -1) {
        scanUsers.push(data.fromusername);
        scene.set('scanUsers', scanUsers);
        scene.save();
      }

      console.log('the number of users scanned:', scene.get('scanUsers').length);

      if (scene.get('scanUsers').length >= scannerLimit) {
        // Notifify the scene creator that
        // there are enough users referred by his QR code
        const templateId = 'RoZSvlxg6rf7JlmBXEnnsbeHnoZ6gKXHY4PJp6lk7IA',
              templateData = {
                first: {value: '报名成功。'},
                class: {value: scene.get('eventName')},
                time: {value: datetime(scene.get('eventTime') || new Date(), {format: 'datetime'})},
                add: {value: '小板凳APP'},
                remark: {value: ''}
              };

        sendTemplateMessage(scene.get('creatorId'), templateData, templateId, token);
      }

      // 给扫描二维码的用户发送一个二维码
      sendQRCodeMessage({
        fromusername: data.fromusername,
        tousername: data.tousername,
        content: scene.get('eventName')
      }, token, res);
    });
};

// Send a message using 客服接口
const sendMessage = (body, accessToken) => {
  console.log('send message...');
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
};

const createUser = (userId, tasksDone) => {
  const WeChatUser = leanCloud.AV.Object.extend('WeChatUser'),
        weChatUser = new WeChatUser();
  tasksDone = tasksDone || 0;
  weChatUser.set('open_id', userId);
  weChatUser.set('tasks_done', tasksDone);
  weChatUser.set('status', 0);
  return weChatUser.save();
};

const onSubscribe = (data, accessToken) => {
  console.log('on subscribe...');
  const userId = data.fromusername,
        mediaId = wechatConfig.imageMediaId,
        body = {
          touser: userId,
          msgtype: 'image',
          image: {
            media_id: mediaId
          }
        },
        content = '请花 10 秒钟阅读上面图片的步骤,\n请花 10 秒钟阅读上面图片的步骤,\n请花 10 秒钟阅读上面图片的步骤,\n否则会出错误哦。\n(重要的事儿说三遍~)';

  // Send image about task
  sendMessage(body, accessToken).then(() => {
    // Send text in 1s
    setTimeout(() => {
      sendText(content, data, accessToken);
    }, 1000);
  });

  // Check if the user is in WeChatUser
  const query = new leanCloud.AV.Query('WeChatUser');
  query.equalTo('open_id', userId);
  query.first().then(user => {
    if (!user) {
      // User does not exist,
      // Create object in WeChatUser
      return createUser(userId);
    }
  });
};

// Assign the task to the user in database
const assignTask = (task, userId) => {
  console.log('assign task...');
  task.set('user_id', userId);
  return task.save().catch(error => {
    console.log(error);
  });
};

// Send a text message to user
const sendText = (content, data, accessToken) => {
  return sendMessage({
    touser: data.fromusername,
    msgtype: 'text',
    text: {content}
  }, accessToken);
};

// Send a voice message to user
const sendVoiceMessage = (transcript, data, accessToken) => {
  const audioURL = transcript.get('fragment_src'),
        audioId = transcript.id,
        mediaSrc = `${global.APP_ROOT}/tmp/${audioId}.mp3`,
        ws = fs.createWriteStream(mediaSrc);

  ws.on('finish', () => {
      console.log('Audio saved in local');

      // Upload the audio as media in Wechat
      uploadMedia(mediaSrc, 'voice', accessToken)
        .then(media => {
          console.log('media uploaded:');
          console.log(media);

          // Delete local audio file
          fs.unlink(mediaSrc);

          // Send the voice message
          return sendMessage({
            touser: data.fromusername,
            msgtype: 'voice',
            voice: {media_id: media.media_id}
          }, accessToken);
        }, error => {
          console.log('upload media failed:', error);
        });
  }, err => {
    console.log('upload media failed:', err);
  });

  // Save the audio to local
  request(audioURL).pipe(ws);
};

// send voice and text to the user
// mode === 'test' for testing permanent voice material
const sendTask = (task, data, accessToken, mode) => {
  console.log('send task...');
  // get Transcript or UserTranscript
  const type = task.get('fragment_type');
  const query = new leanCloud.AV.Query(type);
  return query.get(task.get('fragment_id')).then(transcript => {
    // This transcript can be Transcript or UserTranscript
    if (transcript) {
      const content = type === 'Transcript' ? transcript.get('content_baidu')[0] : transcript.get('content');

      if (mode === 'test') {
        const body = {
                touser: data.fromusername,
                msgtype: 'voice',
                voice: {
                  media_id: '4RQ7o1t9-gZT5OjzshdyCKVcPghEdj39ut0MHp2Lw_g'
                }
              };
        sendMessage(body, accessToken)
        .then(() => {
          return sendText('united states in coordination with the government of nepal he went age your i o n and the governments of australia and canada denmark, ', data, accessToken);
        })
        .then(() => {
          return sendText('请先写修改后的文字，\n然后再写错别字的数量，\n分两次回复，谢谢。', data, accessToken);
        });
      } else {
        // Send text in transcript
        sendText(content, data, accessToken);
        // Send voice
        sendVoiceMessage(transcript, data, accessToken);
      }
    } else {
      console.log('Did not find transcript');
      // Should not get here when normal
      return sendText('对不起，系统错误，请联系管理员。', data, accessToken);
    }
  }, error => {
    console.log('Failed getting transcript', error);
  });
};

// mode = 'test' for testing permanent voice material
const onGetTask = (data, accessToken, mode) => {
  console.log('on get task...');
  const userId = data.fromusername;
  findInProcessTaskForUser(userId).then(task => {
    if (task) {
      // There is a task in process
      return task;
    } else {
      // There is no task in process
      return findNewTaskForUser(userId).then(task => {
        if (task) {
          return assignTask(task, userId);
        } else {
          return task;
        }
      });
    }
  }).then(task => {
    console.log(task);
    if (task) {
      if (mode === 'test') {
        sendTask(task, data, accessToken, 'test');
      } else {
        sendTask(task, data, accessToken);
      }
    } else {
      // inform user there is no available task
      sendText('暂时没有新任务可以领取，请稍后再来！', data, accessToken);
    }
  });
};

// Find a task the user is working on
const findInProcessTaskForUser = userId => {
  console.log('find in-process task...');
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
  const UserTranscript = leanCloud.AV.Object.extend('UserTranscript'),
        userTranscript = new UserTranscript();

  userTranscript.set('media_id', task.get('media_id'));
  userTranscript.set('content', content);
  userTranscript.set('fragment_order', task.get('fragment_order'));
  userTranscript.set('fragment_src', transcript.get('fragment_src'));
  userTranscript.set('user_open_id', userId);

  return userTranscript.save();
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

const completeTaskAndReply = (task, data, accessToken) => {
  console.log('finish task and reply...');

  const userId = data.fromusername;

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
      sendText('么么哒，请回复你的微信号（非微信昵称），稍后我会将1元奖励发送给你！\n\n微信号登记完成后，领取下一分钟任务，请点击“领取任务”', data, accessToken);

      // Change user status to 1
      user.set('status', 1);

      setNeedPay(user);
      user.save();
    } else if (tasksDone % 4 === 0) {
      // User has completed another 4 tasks. Send text
      sendText('么么哒，恭喜你又完成了4个任务，我们会将1元奖励发送给你！\n\n领取下一分钟任务，请点击“领取任务”', data, accessToken);

      setNeedPay(user);
      user.save();
    } else {
      // User has not completed 4 tasks
      sendText('biu~我已经收到了你的文字啦，现在正传输给另外一个小伙伴审核。（错误太多，就会把你拉入黑名单，很恐怖哒。）\n\n下一个片段的任务正在路上赶来，一般需要1～3秒时间。', data, accessToken);

      findNewTaskForUser(userId).then(task => {
        if (task) {
          return assignTask(task, userId);
        } else {
          return task;
        }
      }).then(task => {
        if (task) {
          sendTask(task, data, accessToken);
        } else {
          // inform user there is no available task
          return sendText('暂时没有新任务了，请稍后再尝试“领取任务”。', data, accessToken);
        }
      });
    }
  });
};

const onReceiveTranscription = (data, accessToken, task) => {
  console.log('receive transcription...');

  const userId = data.fromusername,
        content = data.content;

  completeTaskAndReply(task, data, accessToken);

  // Get the relevant transcript / userTranscript
  getTranscript(task).then(transcript => {
    // create new UserTranscript to record transcription
    return createUserTranscript(userId, content, task, transcript);
  }).then(userTranscript => {
    // Create new crowdsourcingTask
    return createCrowdsourcingTask(userTranscript, userId);
  });

  // Mark the transcript wrong_chars = 21
  // Why 21? Because before we use 0-20, 21 is distinct
  getTranscript(task).then(transcript => {
    transcript.set('wrong_chars', 21);
    transcript.save();
  });
};

// // Find last completed task for user
// const findLastTaskForUser = (userId) => {
//   const query = new leanCloud.AV.Query('CrowdsourcingTask');
//   query.equalTo('user_id', userId);
//   query.equalTo('status', 1);
//   query.descending('updatedAt');
//   return query.first();
// };

const findNewTaskForUser = userId => {
  console.log('find new task...');
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

  return query.first()
    .then(task => {
      if (task){
        return task;
      } else {
        query = _constructQuery('Transcript');
        return query.first();
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
    // change status
    user.set('status', 0);
    user.save().then(user => {
      sendText(`微信号登记成功。继续做任务请点击“领取任务”。`, data, accessToken);
    });
  } else {
    // Save WeChatId, ask for confirmation
    user.set('wechat_id', content);
    user.save().then(user => {
      sendText(`微信号：${content}。确认请回复1，修改请回复新的微信号。`, data, accessToken);
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

const onReceiveCorrect = (data, accessToken, task) => {
  console.log('on receive correct...');

  completeTaskAndReply(task, data, accessToken);

  // Mark the transcript wrong_chars = 0
  getTranscript(task).then(transcript => {
    transcript.set('wrong_chars', 0);
    transcript.save();
  });
};

const changeUserStatus = (userId, status) => {
  console.log('change user status...');
  return getUser(userId).then(user => {
    if (user) {
      user.set('status', status);
      return user.save();
    } else {return createUser(userId);}
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
        Scene = leanCloud.AV.Object.extend('Scene'),

  let scene;

  getAccessTokenFromCache().then(accessToken => {
    if (data.msgtype === 'text') {
      // if (data.content === '回复临时素材') {
      //   onGetTask(data, accessToken);
      // } else if (data.content === '回复永久素材') {
      //   // Test 2: send voice
      //   onGetTask(data, accessToken, 'test');
      // }

      // Get user
      getUser(userId).then(user => {
        if (user) {
          return user;
        } else {
          return createUser(userId);
        }
      }).then(user => {
        // Check status
        const userStatus = user.get('status');
        if (userStatus === 1) {
          // Waiting for WeChat ID
          onReceiveWeChatId(data, accessToken, user);
        } else {
          findInProcessTaskForUser(userId).then(task => {
            if (task) {
              if (data.content === '0') {
                onReceiveCorrect(data, accessToken, task);
              } else {
                onReceiveTranscription(data, accessToken, task);
              }
            }
          });
        }
      });
    } else if (data.msgtype === 'event') {
      if (data.event === 'subscribe') {
        onSubscribe(data, accessToken);
      } else if (data.event === 'CLICK' && data.eventkey === 'GET_TASK') {
        changeUserStatus(userId, 0);
        onGetTask(data, accessToken);
      } else if (data.event === 'SCAN') {
        // onQRCodeScanned(data, accessToken, res);
      }
    }
  });
};

module.exports.getCtrl = (req, res, next) => {
  res.send(req.query.echostr);
};
