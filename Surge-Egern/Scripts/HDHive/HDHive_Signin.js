/**
 * HDHive 自动签到
 * Egern 专用
 *
 * 普通签到：[false]
 * 赌狗签到：[true]
 */


// =====================
// 读取 Egern 模块参数
// =====================

const cookie =
  $argument.HDHIVE_COOKIE || "";

const mode =
  $argument.SIGN_MODE || "全部签到";


// HDHive Server Action
const ACTION_ID =
  "40d45889e4bba859ac67c63e5e8b5f78511979a439";


// =====================
// 检查 Cookie
// =====================

if (!cookie) {

  $notification.post(
    "HDHive签到",
    "失败",
    "未配置 Cookie"
  );

  $done();

}


// =====================
// 签到函数
// =====================

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


      function(error, response, data) {


        let result = "";


        if (error) {

          result =
            "请求失败：" + error;


        } else {


          // 已签到
          if (
            data.includes("明天再来") ||
            data.includes("已签到")
          ) {

            result =
              "今日已签到";


          }

          // 成功
          else if (
            data.includes("成功") ||
            data.includes("success")
          ) {

            result =
              "签到成功";


          }

          // 返回原始信息
          else {

            result =
              data
              .replace(/\s+/g," ")
              .substring(0,120);

          }

        }


        resolve(
          name + "：" + result
        );


      }

    );


  });

}



// =====================
// 执行签到
// =====================

(async()=>{


  let result = [];



  // 普通签到

  if (
    mode === "普通签到" ||
    mode === "全部签到"
  ) {


    result.push(

      await checkin(
        "[false]",
        "普通签到"
      )

    );

  }



  // 赌狗签到

  if (
    mode === "赌狗签到" ||
    mode === "全部签到"
  ) {


    result.push(

      await checkin(
        "[true]",
        "赌狗签到"
      )

    );

  }



  // 通知结果

  $notification.post(

    "HDHive签到完成",

    mode,

    result.join("\n")

  );


  $done();


})();
