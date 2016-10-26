'use strict';

const moment = require('moment');

module.exports = {
  /**
   * [format description]
   * @param  {[type]} dt      [description]
   * @param  {Object} options [description]
   * @param  {String} options.format time, date, datetime
   * @return {String} dtString
   */
  format(dt, options) {
    options = options || {};
    let m, str;

    if (typeof dt === 'number') {
      dt = new Date(dt);
    }

    m = moment(dt).utcOffset('+08:00');

    switch (options.format) {
      case 'time':
        str = m.format('h:mm a');
        break;
      case 'datetime':
        str = m.format('MM/DD h:mm a');
        break;
      case 'date':
        str = m.format('MM/DD');
        break;
    }

    return str;
  }
};
