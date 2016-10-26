'use strict';

function UnauthorizedError(code, error) {
  Error.captureStackTrace(this, this.constructor);
  this.name = "UnauthorizedError";
  this.message = typeof error === 'undefined' ? 'Unauthorized' : error.message;
  Error.call(this, this.message);
  this.code = code;
  this.status = 401;
  this.inner = error;
}

UnauthorizedError.prototype = Object.create(Error.prototype);
UnauthorizedError.prototype.constructor = UnauthorizedError;

module.exports = UnauthorizedError;
