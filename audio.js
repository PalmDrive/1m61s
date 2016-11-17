'use strict';

const exec = require('child_process').exec;
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const parseDuration = stdout => {
  // console.log(stdout);
  stdout = stdout.slice(18, 20);
  stdout = parseInt(stdout, 10);
  return stdout;
};

exec('ffprobe /root/dev/1m61s-staging/tmp/5827b8d1a0bb9f00575dc57d.mp3 2>&1 | grep Duration', (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  const duration = parseDuration(stdout);
  console.log('Audio length in seconds:');
  console.log(duration);

  ffmpeg('/root/dev/1m61s-staging/tmp/5827b8d1a0bb9f00575dc57d.mp3')
  .inputFormat('wav')
  .duration(7.5)
  .on('error', function(err, stdout, stderr) {
    console.log('Cannot process file1: ' + err.message);
  })
  .on('end', function() {
    console.log('Finished processing file1');
  })
  .save('/root/dev/1m61s-staging/tmp/5827b8d1a0bb9f00575dc57d_split1.mp3');

  ffmpeg('/root/dev/1m61s-staging/tmp/5827b8d1a0bb9f00575dc57d.mp3')
  .inputFormat('wav')
  .seekInput(7.5)
  .on('error', function(err, stdout, stderr) {
    console.log('Cannot process file2: ' + err.message);
  })
  .on('end', function() {
    console.log('Finished processing file2');
  })
  .save('/root/dev/1m61s-staging/tmp/5827b8d1a0bb9f00575dc57d_split2.mp3');

  // exec('ffprobe outputfile.mp3 2>&1 | grep Duration', (error, stdout, stderr) => {
  //   if (error) {
  //     console.error(`2nd exec error: ${error}`);
  //     return;
  //   }
  //   const duration = parseDuration(stdout);
  //   console.log('2nd Audio length in seconds:');
  //   console.log(duration);
  // });
});




// ffmpeg.ffprobe('/Users/brody/Projects/1m61s/united_states.MP3', (err, medadata) => {
//   if (err) {
//     console.log('err:');
//     console.log(err);
//     return;
//   }

//   console.log(medadata);
// });