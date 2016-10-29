'use strict';

const fs = require('fs'),
      readline = require('readline'),
      uuid = require('node-uuid'),
      //path = '/Users/yujunwu/百度云同步盘/全部/网易云课堂/java/1-2.4 浮点数/1-2.4 浮点数.srt',
      //path = '/Users/yujunwu/Downloads/混沌研习社-曹菲.m4a-字幕.srt',
      LeanCloudStorage = require('./lean_cloud').AV;

const Transcript = LeanCloudStorage.Object.extend('Transcript'),
      Media = LeanCloudStorage.Object.extend('Media');

const strToSec = (str) => {
  const timeArr = str.split(','),
        ms = +timeArr[1],
        timeArr2 = timeArr[0].split(':'),
        hh = +timeArr2[0],
        mm = +timeArr2[1],
        ss = +timeArr2[2];
  return hh * 3600 + mm * 60 + ss + ms / 1000;
};

const save = (path, options) => {
  const transcripts = [];

  let linesCount = 0, transcript;

  const lineReader = readline.createInterface({
    input: fs.createReadStream(path)
  });

  lineReader.on('line', line => {
    if (linesCount === 0) {
      console.log('start to read lines...');
    }

    linesCount += 1;

    //console.log('line:', line);

    if ((linesCount - 1) % 4 === 0) {
      transcript = {
        media_id: options.media_id
      };
      //Object.assign(transcript, options);
      //console.log('line:', line);
      transcript.fragment_order = +line - 1;
    }


    if ((linesCount - 2) % 4 === 0) {
      const timeArr = line.replace(/\s/g, '').split('-->').map(str => strToSec(str));
      transcript.start_at = timeArr[0];
      transcript.end_at = timeArr[1];
    }

    if ((linesCount - 3) % 4 === 0) {
      transcript[`content_${options.service_providers[0]}`] = [line];
      transcripts.push(transcript);
    }
  });

  return new Promise((resolve, reject) => {
    lineReader.on('close', () => {
      console.log('read lines done');

      // transcripts.forEach(t => console.log(t));
      // return resolve(true);

      const transcriptObjs = transcripts.map(t => {
        const obj = new Transcript();
        for (let key in t) {
          obj.set(key, t[key]);
        }
        return obj;
      });

      LeanCloudStorage.Object.saveAll(transcriptObjs)
        .then(LCTranscripts => {
          console.log('transcripts are saved in lean cloud.');

          const media = new Media();
          for (let key in options) {
            media.set(key, options[key]);
          }
          const relation = media.relation('containedTranscripts');
          LCTranscripts.forEach(t => relation.add(t));
          return media.save();
        })
        .then(LCMedia => resolve(LCMedia), err => reject(err));
    });
  });
};

module.exports = {
  save
};

// save('/Users/yujunwu/Downloads/java_网易云/1-2.4 浮点数.srt', {
//   media_src: 'http://xiaobandeng-staging.oss-cn-hangzhou.aliyuncs.com/pipeline_videos/1-2.4_%E6%B5%AE%E7%82%B9%E6%95%B0.m4a',
//   media_id: uuid.v4(),
//   media_name: '1-2.4 浮点数',
//   company_name: '网易云',
//   lan: ['zh'],
//   service_providers: ['baidu']
// })
//   .then(media => {
//     console.log('Done! View the transcripts on:');
//     console.log(`http://pipeline-service-staging.xiaobandengapp.com/medium/${media.get('media_id')}/srt?plat=win`);
//   }, err => {
//     console.log('err:');
//     console.log(err);
//   });
