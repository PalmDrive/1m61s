'use strict';

const _ = require('underscore');

let request_queue = {
  _concurrency: 200,
  _queue: [],
  _running: false,

  push(controllerFn) {
    this._queue.push(controllerFn);
    if (!this._running) {
      this.run();
    }
  },
  run() {
    const len = this._queue.length;
    if (len) {
      this._running = true;

      let fns = [];
      for (let i = 0;i < Math.min(this._concurrency, len); i++) {
        fns.push(this._queue.shift());
      }

      return Promise.all(fns.map(fn => fn()))
        .then(() => this.run(), err => {
          console.log('error in running request_queue:');
          console.log(err);
          return this.run();
        });
    } else {
      this._running = false;
      return console.log('no requests in the queue');
    }
  }
};

module.exports = request_queue;
