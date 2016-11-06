'use strict';

const request = require('request'),
      logger = require('./logger'),
      env = process.env.NODE_ENV || 'development',
      BASE_URL = 'https://leancloud.cn/1.1',
      config = require(`../config/${env}.json`),
      _ = require('underscore'),
      leanCloudConfig = config.lean_cloud;

const LeanCloud = class {
  constructor(options) {
    this._id = options.id;
    this._key = options.key;
    this._masterKey = options.masterKey;
    this.AV = require('leancloud-storage');
    this.AV.init({
      appId: options.id,
      appKey: options.key,
      masterKey: options.masterKey
    });
    this.AV.Cloud.useMasterKey();
  }

  _getReqHeaders() {
    return {
      'X-LC-Id': this._id,
      'X-LC-Key': this._key
    };
  }

  push(params) {
    const endpoint = `${BASE_URL}/push`;

    return new Promise((resolve, reject) => {
      request({
        method: 'post',
        url: endpoint,
        headers: this._getReqHeaders(),
        json: true,
        body: params
      }, (err, res, body) => {
        if (err) {
          return reject(err);
        }

        resolve(res, body);
      });
    });
  }

  subscribeToChannel(device, channel) {
    const endpoint = `${BASE_URL}/installations/${device.objectId}`;

    return new Promise((resolve, reject) => {
      request({
        method: 'put',
        url: endpoint,
        headers: this._getReqHeaders(),
        json: true,
        body: {channels: {__op: 'AddUnique', objects: [channel]}}
      }, (err, res, body) => {
        if (err) {
          logger.info('Subscribe error message: ');
          logger.info(err);
          return reject(err);
        }

        resolve(res, body);
      });
    });
  }

  batchFind(query, limit) {
    let res = [];

    if (limit === null || typeof limit === 'undefined') {
      limit = 1000;
    }
    query.limit(limit);

    const _batchFind = (query, skipCount) => {
      query.skip(skipCount);
      return query.find().then(objects => {
        if (objects && objects.length) {
          res = res.concat(objects);
          return _batchFind(query, skipCount + limit);
        } else {
          return res;
        }
      });
    };

    return _batchFind(query, 0);
  }

  batchDestroy(query) {
    const limit = 500;

    const _destroyAll = (objects) => {
      if (objects.length <= 500) {
        return this.AV.Object.destroyAll(objects);
      } else {
        const objectsToDestroy = objects.splice(0, limit);
        return _destroyAll(objectsToDestroy)
          .then(() => _destroyAll(objects));
      }
    };

    return this.batchFind(query)
      .then(objects => {
        console.log(`fetched objects for destroying: ${objects.length} items`);

        return _destroyAll(objects);
      });
  }

  cloneObject(obj, ObjectClass, options) {
    const json = _.omit(obj.toJSON(), ['id', 'objectId', 'createdAt', 'updatedAt']),
          newObj = new ObjectClass();

    _.extend(json, options || {});

    for (let key in json) {
      newObj.set(key, json[key]);
    }

    //console.log(json);

    return newObj;
  }
};

const options = {
  id: leanCloudConfig.id,
  key: leanCloudConfig.key,
  masterKey: leanCloudConfig.masterKey
};

const leanCloud = new LeanCloud(options);

module.exports = leanCloud;
