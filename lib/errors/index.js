const DEFINED_ERR_TYPES = ['NotFoundError', 'ForbiddenError', 'BadRequestError', 'UnauthorizedError'];

module.exports.isDefined = function(err) {
  return err && DEFINED_ERR_TYPES.indexOf(err.constructor.name) !== -1;
};
