/**
 * HDHive 自动签到
 * Egern 专用
 *
 *
 * 普通签到:
 * [false]
 *
 * 赌狗签到:
 * [true]
 */


const env = $environment || {};


const cookie = env.HDHIVE_COOKIE || "";

const mode = env.SIGN_MODE || "全部签到";


const ACTION_ID =
"40d45889e4bba859ac67c63e5e8b5f78511979a439";



if (!cookie) {

  $notify(
    "HDHive签到",
    "失败",
    "未配置 Cookie"
  );

  $done();

}



function checkin(body, name) {


  return new Promise((resolve)=>{


    $httpClient.post(

      {
        url: "https://hdhive.com/",

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
          "请求错误: "
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


        else{

          msg =
          data
          .replace(/\s+/g," ")
          .substring(0,100);

        }


        resolve(
          name + ": " + msg
        );


      }


    );


  });


}



(async()=>{


  let result = [];


  if(
    mode === "普通签到"
    ||
    mode === "全部签到"
  ){

    result.push(
      await checkin(
        "[false]",
        "普通签到"
      )
    );

  }



  if(
    mode === "赌狗签到"
    ||
    mode === "全部签到"
  ){

    result.push(
      await checkin(
        "[true]",
        "赌狗签到"
      )
    );

  }



  $notify(
    "HDHive签到完成",
    mode,
    result.join("\n")
  );


  $done();


})();
