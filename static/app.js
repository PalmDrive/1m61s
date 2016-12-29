 'use strict';
{
  let app = angular.module('1m61s', []);
  app.controller('appController', function($scope) {

      $scope.rightRateShow = true;
      $scope.todayTaskClick = () => {
        $scope.todayTaskShow = true;
        $scope.rightRateShow = false;
        $scope.totalTaskShow = false;
      };
      $scope.rightRateClick = () => {
        $scope.todayTaskShow = false;
        $scope.rightRateShow = true;
        $scope.totalTaskShow = false;
      };
      $scope.totalTaskClick = () => {
        $scope.todayTaskShow = false;
        $scope.rightRateShow = false;
        $scope.totalTaskShow = true;
      };

  });
}
