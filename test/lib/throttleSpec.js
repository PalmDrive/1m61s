'use strict';

const chai = require('chai'),
      should = chai.should(),
      throttle = require('../../lib/throttle');

describe('Throttle library', () => {
  it('limits function to be called only once during the period with same id', () => {
    let i = 0,
        fn = function() {
          i += 1;
          return i;
        },
        throttledFn = throttle(fn, 'id-1', 500);

    throttledFn();
    throttledFn();
    throttledFn();

    i.should.equal(1);
  });

  it('function can be called multiple times after the period with same id', done => {
    let i = 0,
        fn = function() {
          i += 1;
          return i;
        },
        throttledFn = throttle(fn, 'id-2', 500);

    throttledFn();
    throttledFn();

    setTimeout(function() {
      throttledFn();
      throttledFn();
      throttledFn();
      i.should.equal(2);
      done();
    }, 600);
  });

  it('will not create function with same id twice within the period of time', () => {
    let i = 0,
        fn = function() {
          i += 1;
          return i;
        },
        throttledFn1 = throttle(fn, 'id-3', 500),
        throttledFn2 = throttle(fn, 'id-3', 500),
        flag = throttledFn1 === throttledFn2;

    flag.should.be.true;
  });
});
