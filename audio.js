'use strict';

var ffmpeg = require('fluent-ffmpeg');

ffmpeg.ffprobe('./united_states.mp3', function(err, medadata) {
  if (err) {
    console.log('err:');
    console.log(err);
  }

  console.log(medadata);
});