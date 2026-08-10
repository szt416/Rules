/**
 * HDHive 自动签到
 * Egern http_request 兼容版
 *
 * 普通签到：
 * [false]
 *
 * 赌狗签到：
 * [true]
 */


const cookie = $environment.HDHIVE_COOKIE || "";
const mode = $environment.SIGN_MODE || "普通签到";


const url = "https://hdhive.com/";


function notify(msg) {
  $notify("HDHive签到", "", msg);
}



if (!cookie) {

  notify("失败\n未配置 Cookie");

  $done();

}



function requestSign(isGamble) {


  return new Promise((resolve) => {


    const headers = {

      "Content-Type": "text/plain;charset=UTF-8",

      "Accept": "text/x-component",

      "Origin": "https://hdhive.com",

      "Referer": "https://hdhive.com/",

      "Cookie": cookie,

      "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1",


      "next-action":
      "40d45889e4bba859ac67c63e5e8b5f78511979a439",


      "next-router-state-tree":
      "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D"

    };



    $httpClient.post({

      url: url,

      headers: headers,

      body: isGamble ? "[true]" : "[false]"


    }, function(error, response, body){



      if(error){

        resolve({

          success:false,

          msg:String(error)

        });

        return;

      }



      body = body || "";



      // 已签到

      if(

        body.includes("无需重复签到") ||

        body.includes("已经签到") ||

        body.includes("今日已签到")

      ){

        resolve({

          success:true,

          msg:"今日已经签到"

        });

        return;

      }



      // 安全验证

      if(

        body.includes("安全验证已更新") ||

        body.includes("请重试")

      ){

        resolve({

          success:false,

          verify:true,

          msg:"安全验证已更新，请重试"

        });

        return;

      }



      // 成功

      if(

        body.includes("签到成功") ||

        body.includes("签到")

      ){

        resolve({

          success:true,

          msg:"签到成功"

        });

        return;

      }



      resolve({

        success:false,

        msg:body.substring(0,120)

      });



    });


  });


}




(async()=>{



  let result;



  // 赌狗签到

  if(mode === "赌狗签到"){


    result = await requestSign(true);



    if(result.success){


      notify(

        "赌狗签到成功\n" +

        result.msg

      );


      $done();

    }



    // 赌狗失败，尝试普通签到

    let normal = await requestSign(false);



    if(normal.success){


      notify(

        "赌狗签到失败\n已自动普通签到\n" +

        normal.msg

      );


    }else{


      notify(

        "赌狗签到失败\n普通签到也失败\n" +

        normal.msg

      );


    }



    $done();



  }




  // 普通签到


  result = await requestSign(false);



  if(result.success){


    notify(

      "普通签到成功\n" +

      result.msg

    );


  }else{


    notify(

      "普通签到失败\n" +

      result.msg

    );


  }



  $done();



})();
