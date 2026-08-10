/**
 * HDHive 自动签到
 * Egern 专用
 * 支持：
 *  普通签到
 *  赌狗签到
 *  赌狗失败自动普通签到
 */

const cookie = ctx.env.HDHIVE_COOKIE || "";
const mode = ctx.env.SIGN_MODE || "普通签到";

const url = "https://hdhive.com/";

function notify(title, body) {
  $notify(title, "", body);
}

if (!cookie) {
  notify("HDHive签到", "失败\n未获取 Cookie");
  throw new Error("Cookie为空");
}


// 获取签到类型
async function sign(type) {

  // 普通签到 false
  // 赌狗签到 true
  const body = type ? "[true]" : "[false]";

  const headers = {
    "Content-Type": "text/plain;charset=UTF-8",
    "Accept": "text/x-component",
    "Origin": "https://hdhive.com",
    "Referer": "https://hdhive.com/",
    "Cookie": cookie,
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1",

    // HDHive Next.js Action
    "next-action":
      "40d45889e4bba859ac67c63e5e8b5f78511979a439",

    "next-router-state-tree":
      "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D"
  };


  try {

    const resp = await $httpClient.post({
      url,
      headers,
      body
    });


    let result = resp.body || "";


    // 已签到
    if (
      result.includes("无需重复签到") ||
      result.includes("已经签到")
    ) {
      return {
        success: true,
        msg: "今日已经签到"
      };
    }


    // 安全验证
    if (
      result.includes("安全验证已更新") ||
      result.includes("请重试")
    ) {
      return {
        success: false,
        verify: true,
        msg: "安全验证已更新，请重试"
      };
    }


    // 成功关键词
    if (
      result.includes("成功") ||
      result.includes("签到")
    ) {
      return {
        success: true,
        msg: result
      };
    }


    return {
      success:false,
      msg:result.substring(0,100)
    };


  } catch(e){

    return {
      success:false,
      msg:String(e)
    };

  }
}



(async()=>{


  let result;


  // 赌狗签到
  if(mode === "赌狗签到"){

    result = await sign(true);


    // 赌狗失败自动普通签到
    if(!result.success){

      let normal = await sign(false);


      if(normal.success){

        notify(
          "HDHive签到",
          "赌狗签到失败\n已自动普通签到\n" + normal.msg
        );

      }else{

        notify(
          "HDHive签到",
          "赌狗签到失败\n普通签到也失败\n" +
          normal.msg
        );

      }

      return;
    }


    notify(
      "HDHive签到",
      "赌狗签到\n" + result.msg
    );

    return;

  }



  // 普通签到
  result = await sign(false);


  if(result.success){

    notify(
      "HDHive签到",
      "普通签到\n" + result.msg
    );

  }else{

    notify(
      "HDHive签到",
      "普通签到失败\n" + result.msg
    );

  }


})();
