'use strict';

let _cache = {};

/**
 * [throttle description]
 *
 * Return a function that when invoked repeatedly, will only actually call the original function at most once per every wait milliseconds with the same id.
 *
 * @param  {Function} fn   [description]
 * @param  {String | Number}   id id needs globally unique
 * @param  {Number}   wait wait per milliseconds
 * @return {Function}        [description]
 */
function throttle(fn, id, wait) {
  let throttledFn;

  if (_cache[id]) {
    throttledFn = _cache[id].fn;
  } else {
    throttledFn = function() {
      if (!_cache[id]) {
        _cache[id] = {
          fn: throttledFn
        };
      }

      if (!_cache[id].called) {
        _cache[id].called = 1
        setTimeout(function() {
          delete _cache[id];
        }, wait);
        fn.apply(this, arguments);
      }
    };
    _cache[id] = {
      fn: throttledFn
    };
  }

  return throttledFn;
}

module.exports = throttle;
