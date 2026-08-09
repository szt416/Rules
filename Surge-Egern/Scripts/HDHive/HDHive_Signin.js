/**
 * HDHive 自动签到
 * Egern Script
 *
 * 普通签到:
 * [false]
 *
 * 赌狗签到:
 * [true]
 */


const ACTION_ID =
"40d45889e4bba859ac67c63e5e8b5f78511979a439";


const cookie =
$argument.HDHIVE_COOKIE || "";


if (!cookie) {

  $notification.post(
    "HDHive签到",
    "失败",
    "未填写 Cookie"
  );

  $done();

}



function sign(body, name) {


  return new Promise((resolve)=>{


    $httpClient.post({

      url:
      "https://hdhive.com/",


      headers: {

        "Accept":
        "text/x-component",

        "Content-Type":
        "text/plain;charset=UTF-8",

        "Origin":
        "https://hdhive.com",

        "Referer":
        "https://hdhive.com/",

        "next-action":
        ACTION_ID,

        "Cookie":
        cookie
      },


      body: body


    },


    function(error, response, data){


      let msg = "";


      if(error){

        msg =
        "请求失败: "
        + error;

      }

      else if(
        data.includes("明天再来")
      ){

        msg =
        "今日已签到";

      }

      else if(
        data.includes("成功")
        ||
        data.includes("\"success\":true")
      ){

        msg =
        "签到成功";

      }

      else {

        msg =
        data
        .replace(/\s+/g," ")
        .slice(0,80);

      }


      resolve(
        name + ": " + msg
      );


    });


  });


}



(async()=>{


  let normal =
  await sign(
    "[false]",
    "普通签到"
  );


  let gamble =
  await sign(
    "[true]",
    "赌狗签到"
  );


  $notification.post(
    "HDHive签到完成",
    "",
    normal +
    "\n" +
    gamble
  );


  $done();


})();
