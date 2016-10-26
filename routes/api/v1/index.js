'use strict';

const express = require('express'),
      router = express.Router(),
      path = require('path'),
      fs = require('fs');

const excludedFiles = ['db-structure.js'],
      basename = path.basename(module.filename);

excludedFiles.push(basename);

fs
  .readdirSync(__dirname)
  .filter(function(file) {
    return excludedFiles.indexOf(file) === -1;
  })
  .forEach(function(file) {
    require(`./${file.replace('.js', '')}`)(router);
  });

module.exports = router;
