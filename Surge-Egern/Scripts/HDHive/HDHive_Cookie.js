let cookie = "";

if ($request.headers["Cookie"]) {
    cookie = $request.headers["Cookie"];
}

if ($request.headers["cookie"]) {
    cookie = $request.headers["cookie"];
}


if (cookie && cookie.includes("token=")) {

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
