$(function(){

  $(".rightRate").show();
  $(".todayTask").hide();
  $(".totalTask").hide();

  $(".todayTaskClick").css("color","#000000");
  $(".rightRateClick").css("color","#0000ff");
  $(".totalTaskClick").css("color","#000000");

   window.todayTaskClick = function() {
    $(".rightRate").hide();
    $(".todayTask").show();
    $(".totalTask").hide();

    $(".todayTaskClick").css("color","#0000ff");
    $(".rightRateClick").css("color","#000000");
    $(".totalTaskClick").css("color","#000000");
  };

  window.rightRateClick = function() {
    $(".rightRate").show();
    $(".todayTask").hide();
    $(".totalTask").hide();

    $(".todayTaskClick").css("color","#000000");
    $(".rightRateClick").css("color","#0000ff");
    $(".totalTaskClick").css("color","#000000");
  };

  window.totalTaskClick = function() {
    $(".rightRate").hide();
    $(".todayTask").hide();
    $(".totalTask").show();

    $(".todayTaskClick").css("color","#000000");
    $(".rightRateClick").css("color","#000000");
    $(".totalTaskClick").css("color","#0000ff");
  };

})

