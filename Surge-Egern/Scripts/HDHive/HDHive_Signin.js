const cookie = $persistentStore.read("HDHive_Cookie");


if (!cookie) {

    $notification.post(
        "HDHive签到",
        "失败",
        "未获取Cookie，请先打开HDHive网站"
    );

    $done();
}


function request(body, name) {


    $httpClient.post(
        {
            url: "https://hdhive.com/",
            headers: {
                "Cookie": cookie,
                "Content-Type": "text/plain;charset=UTF-8",
                "Accept": "text/x-component",
                "Origin": "https://hdhive.com",
                "Referer": "https://hdhive.com/"
            },
            body: body
        },

        function(error, response, data) {


            if(error){

                $notification.post(
                    "HDHive签到",
                    name,
                    "请求失败"
                );

                return;
            }


            $notification.post(
                "HDHive签到",
                name,
                "执行完成\nHTTP:" + response.status
            );


        }
    );

}



request(
    "[true]",
    "普通签到"
);


request(
    "[false]",
    "赌狗签到"
);



$done();
