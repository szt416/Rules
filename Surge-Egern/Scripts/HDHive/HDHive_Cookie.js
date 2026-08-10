// HDHive Cookie获取

const enable = ctx.env.COOKIE_GET;


if (enable !== "true") {

    $done({});

}



let cookie =
$request.headers["Cookie"] ||
$request.headers["cookie"];



if(cookie && cookie.includes("token=")){


    $persistentStore.write(
        cookie,
        "HDHive_Cookie"
    );


    $notification.post(
        "HDHive",
        "Cookie获取成功",
        "Cookie长度：" + cookie.length
    );

}



$done({});
