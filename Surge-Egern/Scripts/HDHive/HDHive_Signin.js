/**
 * HDHive 自动签到
 * Egern 原生脚本
 *
 * 普通签到:
 * [false]
 *
 * 赌狗签到:
 * [true]
 */

export default async function (ctx) {


  const cookie =
    ctx.storage.get("HDHive_Cookie") || "";


  const mode =
    ctx.env.SIGN_MODE || "普通签到";



  if (!cookie) {

    ctx.notify({

      title: "HDHive签到",

      subtitle: "失败",

      body:
        "未找到 Cookie\n" +
        "请开启 Cookie 捕获后访问 HDHive 首页"

    });

    return;

  }



  const result =
    await sign(ctx, cookie, mode === "赌狗签到");



  // 赌狗失败自动普通签到

  if (

    mode === "赌狗签到" &&

    !result.success

  ) {


    const normal =
      await sign(ctx, cookie, false);



    if(normal.success){


      ctx.notify({

        title:"HDHive签到",

        subtitle:"赌狗签到失败",

        body:
          "已自动执行普通签到\n\n" +
          normal.msg

      });


    }else{


      ctx.notify({

        title:"HDHive签到",

        subtitle:"签到失败",

        body:
          "赌狗:\n" +
          result.msg +
          "\n\n普通:\n" +
          normal.msg

      });


    }


    return;

  }



  ctx.notify({

    title:"HDHive签到",

    subtitle:mode,

    body:result.msg

  });


}




async function sign(ctx,cookie,gamble){


  const headers = {


    "Accept":
      "text/x-component",


    "Content-Type":
      "text/plain;charset=UTF-8",


    "Origin":
      "https://hdhive.com",


    "Referer":
      "https://hdhive.com/",


    "next-action":
      "40d45889e4bba859ac67c63e5e8b5f78511979a439",


    "next-router-state-tree":
      "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D",


    "Cookie":
      cookie,


    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1"

  };



  try{


    const response =
      await ctx.http.post(

        "https://hdhive.com/",

        {

          headers,

          body:
            gamble
            ? "[true]"
            : "[false]",

          timeout:20000

        }

      );



    const text =
      await response.text();



    return parse(text,response.status);



  }catch(e){


    return {

      success:false,

      msg:
        "请求异常\n" +
        String(e)

    };

  }


}





function parse(text,status){


  const data =
    String(text || "");



  if(

    data.includes("已经签到") ||

    data.includes("无需重复签到") ||

    data.includes("今日已签到")

  ){

    return {

      success:true,

      msg:
        "今日已经签到，无需重复签到"

    };

  }




  if(

    data.includes("安全验证已更新") ||

    data.includes("请重试")

  ){

    return {

      success:false,

      msg:
        "安全验证已更新，请重试"

    };

  }




  if(

    data.includes("未登录") ||

    data.includes("Unauthorized") ||

    status===401

  ){

    return {

      success:false,

      msg:
        "Cookie失效，请重新获取"

    };

  }





  if(

    data.includes("成功")

  ){

    return {

      success:true,

      msg:
        "签到成功"

    };

  }




  return {


    success:false,


    msg:
      `HTTP ${status}\n`+
      data
      .replace(/\s+/g," ")
      .slice(0,150)

  };


}
