'use strict';

var ffmpeg = require('fluent-ffmpeg');

ffmpeg.ffprobe('/root/dev/1m61s-staging/united_states.MP3', function(err, medadata) {
  if (err) {
    console.log('err:');
    console.log(err);
  }

  console.log(medadata);
});