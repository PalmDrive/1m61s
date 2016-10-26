'use strict';

function ForbiddenError(code, error) {
  Error.captureStackTrace(this, this.constructor);
  this.name = "ForbiddenError";
  this.message = typeof error === 'undefined' ? 'ForbiddenError' : error.message;
  Error.call(this, this.message);
  this.code = code;
  this.status = 403;
  this.inner = error;
}

ForbiddenError.prototype = Object.create(Error.prototype);
ForbiddenError.prototype.constructor = ForbiddenError;

module.exports = ForbiddenError;
