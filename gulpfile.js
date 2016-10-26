'use strict';

const gulp = require('gulp'),
    apidoc = require('gulp-apidoc'),
    args = require('yargs').argv,
    _ = require('underscore'),
    csv = require('fast-csv'),
    fs = require('fs'),
    leanCloud = require('./lib/lean_cloud'),
    WeChat = require('./controllers/wechat'),
    request = require('request');

require('./data_analyze');

gulp.task('apidoc', () => {
              apidoc.exec({
                  src: 'routes/api/',
                  dest: 'apidoc/',
                  debug: true,
                  includeFilters: [ '.*\\.js$' ]
              });
});

// Create tasks based on transcript
gulp.task('createTasks', done => {
  const query = new leanCloud.AV.Query('Transcript'),
        Task = leanCloud.AV.Object.extend('CrowdsourcingTask');
  query.descending('createdAt');
  query.limit(500);
  query.find().then(transcripts => {
    const tasks = transcripts.map(t => {
      const task = new Task();
      ['fragment_order', 'media_id'].forEach(field => {
        task.set(field, t.get(field));
      })
      task.set('fragment_id', t.id);
      task.set('status', 0);
      task.set('fragment_type', 'Transcript');
      task.set('is_head', t.get('fragment_order') % 4 === 0);
      return task;
    });
    leanCloud.AV.Object.saveAll(tasks)
      .then(() => done(), err => {
        console.log(err);
        done();
      });
  });
});

gulp.task('fixfragmentorder', done => {
  //const mediaId = 'wca38b63-1674-47c3-9482-d1ae5359a76w';
  const mediaId = 'df6aeb17-29a0-4c47-9ca7-74e66d6cf399';

  const update = (skipCount) => {
    const query = new leanCloud.AV.Query('Transcript'),
          limit = 1000;

    query.ascending('start_at');
    query.equalTo('media_id', mediaId);
    query.limit(limit);
    query.skip(skipCount);
    return query.find().then(transcripts => {
      if (transcripts && transcripts.length) {
        transcripts.forEach((t, index) => {
          t.set('fragment_order', index + skipCount);
        });
        return leanCloud.AV.Object.saveAll(transcripts)
          .then(() => {
            console.log(`${skipCount} - ${skipCount + limit - 1} objects are processed`);
            return update(limit + skipCount);
          });
      } else {
        return true;
      }
    });
  };

  update(0).then(() => done(), err => {
    console.log(err);
    done();
  });
});

gulp.task('mergetranscripts', done => {
  const mediaId = 'wca38b63-1674-47c3-9482-d1ae5359a76w',
        Transcript = leanCloud.AV.Object.extend('Transcript'),
        subMediaIds = ['1bcdd57c-adf3-44ba-a16a-6dea60367231', '588355c1-9398-49c9-b565-c5f6b39bbf65', '167821d5-83eb-4d17-a1b5-2fb76b5227d3','79717691-3010-43f5-bdb5-cf8b9ab90196', '686a0db1-0237-4ea6-b7c3-1d4b35aa0159', '532b856a-8f3f-4d63-a8ef-3b290a1c7a59', '72c4bae3-bdda-471d-88f1-e2ee23fcf40b', 'f2f636de-55cf-4336-bf79-717158f08c69'],
        relativeTimeOffsets = [
          0,
          1799.361,
          1800.273,
          1801.415,
          1801.157,
          1801.807,
          1798.957,
          1804.795
        ];

  let transcripts = [],
      timeOffsets = [];

  relativeTimeOffsets.forEach((offset, index) => {
    const base = timeOffsets[index - 1] || 0;
    timeOffsets.push(base + offset);
  });

  const getTranscriptsWithTimeOffset = (mediaId, timeOffset) => {
    const query = new leanCloud.AV.Query('Transcript');
    query.ascending('start_at');
    query.equalTo('media_id', mediaId);
    query.limit(1000);

    timeOffset = timeOffset || 0;

    return query.find().then(objects => {
      objects.forEach(obj => {
        obj.set('start_at', obj.get('start_at') + timeOffset);
        obj.set('end_at', obj.get('end_at') + timeOffset);
      });
      return objects;
    });
  };

  const cloneObject = (obj, options, ObjectClass) => {
    const json = _.omit(obj.toJSON(), ['id', 'objectId']),
          newObj = new ObjectClass();

    _.extend(json, options);
    for (let key in json) {
      newObj.set(key, json[key]);
    }
    return newObj;
  };

  Promise.all(subMediaIds.map((id, index) => getTranscriptsWithTimeOffset(id, timeOffsets[index])))
    .then(res => {
      console.log('fetched transcripts from all sub medium');

      transcripts = _.flatten(res)
                    .map(t => cloneObject(t, {media_id: mediaId}, Transcript));

      const query = new leanCloud.AV.Query('Transcript');
      query.equalTo('media_id', mediaId);
      return leanCloud.batchDestroy(query);
    })
    .then(() => {
      console.log('cleared old transcripts in the main media');

      transcripts.forEach((t, index) => {
        t.set('fragment_order', index);
      });
      return leanCloud.AV.Object.saveAll(transcripts);
    })
    .then(res => {
      const mediaQuery = new leanCloud.AV.Query('Media');
      mediaQuery.equalTo('media_id', mediaId);
      return mediaQuery.first()
        .then(media => {
          const relation = media.relation('containedTranscripts');
          res.map(t => relation.add(t));
          return media.save();
        });
    })
    .then(() => done(), err => {
      console.log(err);
      done();
    });
});

gulp.task('fixtime', done => {
  const mediaId = 'edce99c9-4be8-4d4c-aff0-a7aff7f4f9ec',
        offset = +0.03,
        query = new leanCloud.AV.Query('Transcript');

  query.equalTo('media_id', mediaId);
  query.ascending('start_at');

  leanCloud.batchFind(query)
    .then(transcripts => {
      transcripts.forEach(t => {
        t.set('start_at', t.get('start_at') + offset);
        t.set('end_at', t.get('end_at') + offset);
      });

      return leanCloud.AV.Object.saveAll(transcripts);
    })
    .then(() => done(), err => {
      console.log(err);
      done();
    });
});

gulp.task('checktime', done => {
  const query = new leanCloud.AV.Query('Transcript'),
        mediaId = 'edce99c9-4be8-4d4c-aff0-a7aff7f4f9ec',
        tolerance = 0.03,
        errors = [];

  query.equalTo('media_id', mediaId);
  query.ascending('start_at');

  const tojson = (t) => {
    return {
      id: t.id,
      start_at: t.get('start_at'),
      end_at: t.get('end_at')
    };
  };

  leanCloud.batchFind(query)
    .then(transcripts => {
      transcripts.forEach((t, index) => {
        const nextTranscript = transcripts[index + 1];
        if (nextTranscript) {
          const nextStartAt = nextTranscript.get('start_at'),
                endAt = t.get('end_at');

          if (+endAt.toFixed(3) > +nextStartAt.toFixed(3)) {
            errors.push({
              msg: 'end time is greater than the next start time',
              transcript: tojson(t),
              nextTranscript: tojson(nextTranscript),
              type: 1
            });
          } else if (nextStartAt - endAt > tolerance) {
            errors.push({
              msg: `the diff between the end time and the next start time is greater than ${tolerance} sec`,
              transcript: tojson(t),
              nextTranscript: tojson(nextTranscript),
              type: 2
            });
          }
        }
      });

      if (errors.length) {
        const errors1 = errors.filter(e => e.type === 1),
              errors2 = errors.filter(e => e.type === 2);

        //console.log(`there are ${errors.length} errors:`);
        console.log(errors1);
        console.log(errors2);
      }
      done();
    }, err => {
      console.log(err);
      done();
    });
});

gulp.task('addtranscripts', done => {
  const mediaId = 'wca38b63-1674-47c3-9482-d1ae5359a76w',
        Transcript = leanCloud.AV.Object.extend('Transcript'),
        subMediaIds = [
          '532b856a-8f3f-4d63-a8ef-3b290a1c7a59',
          '72c4bae3-bdda-471d-88f1-e2ee23fcf40b',
          'f2f636de-55cf-4336-bf79-717158f08c69'
        ],
        relativeTimeOffsets = [
          9004.013,
          1798.957,
          1804.795
        ];

  let transcripts = [],
      timeOffsets = [];

  relativeTimeOffsets.forEach((offset, index) => {
    const base = timeOffsets[index - 1] || 0;
    timeOffsets.push(base + offset);
  });

  //timeOffsets = [7202.206];

  const getTranscriptsWithTimeOffset = (mediaId, timeOffset) => {
    const query = new leanCloud.AV.Query('Transcript');
    query.ascending('start_at');
    query.equalTo('media_id', mediaId);
    query.limit(1000);

    timeOffset = timeOffset || 0;

    return query.find().then(objects => {
      objects.forEach(obj => {
        obj.set('start_at', obj.get('start_at') + timeOffset);
        obj.set('end_at', obj.get('end_at') + timeOffset);
      });
      return objects;
    });
  };

  const cloneObject = (obj, options, ObjectClass) => {
    const json = _.omit(obj.toJSON(), ['id', 'objectId']),
          newObj = new ObjectClass();

    _.extend(json, options);
    for (let key in json) {
      newObj.set(key, json[key]);
    }
    return newObj;
  };

  Promise.all(subMediaIds.map((id, index) => getTranscriptsWithTimeOffset(id, timeOffsets[index])))
    .then(res => {
      transcripts = _.flatten(res)
                    .map(t => cloneObject(t, {media_id: mediaId}, Transcript));

      console.log(`fetched transcripts from all sub medium: ${transcripts.length}`);

      const query = new leanCloud.AV.Query('Transcript');
      query.equalTo('media_id', mediaId);
      //return leanCloud.batchDestroy(query);
      return true;
    })
    .then(() => {
      //console.log('cleared old transcripts in the main media');

      // transcripts.forEach((t, index) => {
      //   t.set('fragment_order', index);
      // });
      return leanCloud.AV.Object.saveAll(transcripts);
    })
    .then(res => {
      console.log('saved all transcripts');

      const mediaQuery = new leanCloud.AV.Query('Media');
      mediaQuery.equalTo('media_id', mediaId);
      return mediaQuery.first()
        .then(media => {
          const relation = media.relation('containedTranscripts');
          res.map(t => relation.add(t));
          return media.save();
        });
    })
    .then(() => done(), err => {
      console.log(err);
      done();
    });
});

gulp.task('getWeChatImageList', done => {
  WeChat.getAccessToken()
  .then(accessToken => {
    request.post({
      url: `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${accessToken}`,
      json: true,
      body: {
        type: 'image',
        offset: 0,
        count: 20
      }
    }, (error, response, body) => {
      if (error) {
        console.log(error);
        done();
      } else {
        console.log(body);
        done();
      }
    });
  });
});

// Reset leanCloud for wechat test
// Delete all userTranscripts
// Delete crowdsourcingTasks with fragment_type === 'UserTranscript'. Unset user_id in CrowdsourcingTask
// Set all tasks_done to 0
gulp.task('resetForWeChatTest', done => {
  const deleteAll = (clss) => {
    const query = new leanCloud.AV.Query(clss);
    query.limit(1000); // Assume there are no more than 1000 rows in the class
    return query.find()
      .then(objs => leanCloud.AV.Object.destroyAll(objs));
  };

  const resetCrowdsourcingTask = () => {
    const query = new leanCloud.AV.Query('CrowdsourcingTask');
    query.equalTo('fragment_type', 'UserTranscript');
    query.limit(1000);
    return query.find().then(objs => {
      return leanCloud.AV.Object.destroyAll(objs);
    }).then(() => {
      const query = new leanCloud.AV.Query('CrowdsourcingTask');
      query.limit(1000);
      query.exists('user_id');
      return query.find();
    }).then(tasks => {
      // Unset user_id
      tasks.forEach(task => {
        task.unset('user_id');
      });
      return leanCloud.AV.Object.saveAll(tasks);
    });
  };

  const resetTasksDone = () => {
    const query = new leanCloud.AV.Query('WeChatUser');
    query.limit(1000);
    return query.find().then(users => {
      users.forEach(user => {
        user.set('tasks_done', 0);
      });

      return leanCloud.AV.Object.saveAll(users);
    });
  };

  Promise.all([
    deleteAll('UserTranscript'),
    resetCrowdsourcingTask(),
    resetTasksDone()
  ]).then(() => {
    done();
  });
});
