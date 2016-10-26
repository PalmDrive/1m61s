'use strict';

const chai = require('chai'),
      should = chai.should(),
      Datetime = require('../../lib/datetime');

describe('Datetime library', () => {
  it('converts the datetime to time string', () => {
    var timestamp = 1439776313170;
    Datetime.format(timestamp, {format: 'time'}).should.equal('9:51 am');
  });
});
