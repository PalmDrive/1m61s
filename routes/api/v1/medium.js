'use strict';

const srtToLC = require('../../../lib/srt_to_lc'),
      uuid = require('node-uuid'),
       BadRequestError = require('../../../lib/errors/BadRequestError'),
      request = require('request'),
      fs = require('fs');

module.exports = router => {
  /**
   * @api {get} /api/v1/medium/upload_srt
   * @apiName  Upload srt
   * @apiGroup Medium
   * @apiVersion 1.0.0
   *
   * @apiDescription Upload the srt to lean cloud to create transcripts
   *
   * @apiParam {Object} data
   * @apiParam {String} data.srtSrc
   * @apiParam {String} data.mediaName
   * @apiParam {String} data.mediaSrc
   *
   * @apiParamExample {json} request example:
   *                         {
   *                           data: {
   *                             srtSrc: 'xxx',
   *                             mediaName: 'xxx',
   *                             mediaSrc: 'xxx'
   *                           }
   *                         }
   * @apiSuccess (200) response
   * @apiSuccessExample success response example:
   *                    {
   *                      data: {
   *                        media_id: 'xxx'
   *                      }
   *                    }
   */
  router.post('/medium/upload_srt', (req, res, next) => {
    const data = req.body.data,
          options = {
            media_src: data.mediaSrc,
            media_id: uuid.v4(),
            media_name: data.mediaName
          },
          tmpFilePath = `./tmp/${options.media_id}_${+ new Date()}.srt`,
          ws = fs.createWriteStream(tmpFilePath);

    ws.on('finish', () => {
      console.log('srt file downloaded.');

      srtToLC.save(tmpFilePath, options)
        .then(() => {
          // remove the tmp file
          fs.unlink(tmpFilePath);
          console.log('removing the tmp file...');

          res.send({
            data: {
              mediaId: options.media_id
            }
          });
        }, err => next(new BadRequestError('400', err)));
    });

    // Download the remote file
    console.log(`downloading file from ${data.srtSrc}`);
    request.get(encodeURI(data.srtSrc)).pipe(ws);
  });
};
