'use strict';

const ffmpeg = require('fluent-ffmpeg');

ffmpeg.ffprobe('./united_states.mp3', (err, medadata) => {
  if (err) {
    console.log('err:');
    console.log(err);
  }

  console.log(medadata);
});