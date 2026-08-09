/**
 * HDHive 自动签到
 * Egern Script
 *
 * 普通签到 [false]
 * 赌狗签到 [true]
 */


const ACTION_ID =
"40d45889e4bba859ac67c63e5e8b5f78511979a439";


const cookie =
$argument.HDHIVE_COOKIE || "";


const mode =
$argument.SIGN_MODE || "全部签到";


if (!cookie) {

  $notification.post(
    "HDHive签到",
    "失败",
    "未配置 Cookie"
  );

  $done();

}



function doCheck(body, title){


  return new Promise(resolve=>{


    $httpClient.post(

    {

      url:
      "https://hdhive.com/",


      headers:
      {

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


      body:
      body


    },


    (error,response,data)=>{


      let result="";


      if(error){

        result =
        "请求错误: "
        + error;

      }

      else if(
        data.includes("明天再来")
      ){

        result =
        "今日已经签到";

      }

      else if(
        data.includes("成功")
        ||
        data.includes("\"success\":true")
      ){

        result =
        "签到成功";

      }

      else {

        result =
        data
        .replace(/\s+/g," ")
        .substring(0,100);

      }


      resolve(
        title + ": " + result
      );


    });


  });


}



(async()=>{


let result=[];



if(
mode==="普通签到"
||
mode==="全部签到"
){

 result.push(
   await doCheck(
     "[false]",
     "普通签到"
   )
 );

}



if(
mode==="赌狗签到"
||
mode==="全部签到"
){

 result.push(
   await doCheck(
     "[true]",
     "赌狗签到"
   )
 );

}



$notification.post(

"HDHive签到完成",

mode,

result.join("\n")

);



$done();


})();
