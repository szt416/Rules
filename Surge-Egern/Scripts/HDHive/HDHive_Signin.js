/**
 * HDHive 自动签到
 */


const cookie =
$persistentStore.read("HDHive_Cookie");



if(!cookie){


    $notification.post(
        "HDHive签到",
        "失败",
        "未获取Cookie"
    );


    $done();

}



const nextAction =
"40d45889e4bba859ac67c63e5e8b5f78511979a439";




function signin(body,name){



    $httpClient.post(

    {

        url:"https://hdhive.com/",


        headers:{


            "Cookie":cookie,


            "Accept":"text/x-component",


            "Content-Type":
            "text/plain;charset=UTF-8",


            "Origin":
            "https://hdhive.com",


            "Referer":
            "https://hdhive.com/",


            "next-action":
            nextAction


        },


        body:body


    },


    function(error,response,data){



        if(error){


            $notification.post(
                "HDHive签到",
                name,
                "请求失败\n"+error
            );


            return;

        }



        $notification.post(

            "HDHive签到",

            name,

            "HTTP:"
            +
            response.status
            +
            "\n"
            +
            data.substring(0,100)

        );



    });



}



// 普通签到

signin(
"[true]",
"普通签到"
);



// 赌狗签到

signin(
"[false]",
"赌狗签到"
);



$done();
