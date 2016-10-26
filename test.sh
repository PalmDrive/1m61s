#!/bin/bash
# Run all the tests in ./tests directory

TEST_FILES="./test/**/*Spec.js"

#NODE_ENV=test node_modules/mocha/bin/mocha $TEST_FILES --compilers js:babel/register --debug-brk
if [ -z "$1" ]; then
  NODE_ENV=test node_modules/mocha/bin/mocha $TEST_FILES --timeout 5000 --compilers js:babel/register
else
  NODE_ENV=test node_modules/mocha/bin/mocha $TEST_FILES --timeout 5000 --compilers js:babel/register -g "$1"
fi
