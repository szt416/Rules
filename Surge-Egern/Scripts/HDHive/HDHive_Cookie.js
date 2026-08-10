const enable = $environment.AUTO_COOKIE;


if(enable === "false"){

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
