'use strict';

var _ = require('underscore');

var _dtStr2Timestamp = function(dtStr) {
  return new Date(dtStr).getTime();
}

/**
 * Convert the instance to a JSON representation.
 *
 * @param  {Object}         instance       The database record instance
 * @param  {Object}         options
 * @param  {Array[String]}  options.only   Specify the fields that will be populated only
 * @param  {Array[String]}  options.except Specify the fields that will not be populated
 * @param  {Array[String]}  options.methods Specify the value returned from the instance method
 * @return {Object}         json           JSON representation of the instance
 */
const toBaseJSON = function(instance, options) {
  options = options || {};

  let json = instance.toJSON();

  if (options.only) {
    json = _.pick(json, options.only);
  }

  if (options.except) {
    json = _.omit(json, options.except);
  }

  if (options.methods) {
    _.each(options.methods, function(method) {
      json[method] = instance[method].call(instance);
    });
  }

  // convert timestamp to unix timestamp
  if (json.createdAt) {
    json.createdAt = _dtStr2Timestamp(json.createdAt);
  }
  if (json.updatedAt) {
    json.updatedAt = _dtStr2Timestamp(json.updatedAt);
  }

  return json;
};

const toAPIJSON = function(instance, type, options) {
  if (!instance) {
    return null;
  }

  let defaultOptions = {
    except: ['id']
  };

  _.extend(defaultOptions, options || {});

  return {
    id: instance.id,
    type: type,
    attributes: toBaseJSON(instance, defaultOptions)
  };
};

module.exports = {
  toBaseJSON,
  toAPIJSON
};
