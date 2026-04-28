const { chromium } = require('playwright');

(async () => {

    const browser = await chromium.launch({
        headless: false,
        slowMo: 500
    });

    const context = await browser.newContext({
        storageState: 'fb-session.json'
    });

    const page = await context.newPage();

    await page.goto(
        'https://www.facebook.com/groups/mku.cfs',
        {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        }
    );

    await page.waitForTimeout(8000);

    let processed = new Set();
    let collected = 0;
    const MAX_POSTS = 1;

    let allPosts = [];


    while (collected < MAX_POSTS) {

        let posts = await page.locator(
            'div[role="feed"] div[aria-posinset]'
        ).all();


        for (let post of posts) {

            if (collected >= MAX_POSTS)
                break;


            let pid =
                await post.getAttribute(
                    'aria-posinset'
                );

            if (
                pid &&
                processed.has(pid)
            ) continue;

            processed.add(pid);


            await post.scrollIntoViewIfNeeded();
            await page.waitForTimeout(2000);



            let data = {
                author: "",
                content: "",
                post_url: "",
                comments: []
            };



            // ===== TÁC GIẢ =====
            try {

                data.author =
                    (
                        await post.locator(
                            'h2 strong,h3 strong,strong'
                        ).first().innerText()
                    ).trim();

            } catch { }



            // ===== NỘI DUNG =====
            try {

                let texts =
                    await post.locator(
                        'div[dir="auto"]'
                    ).allInnerTexts();

                data.content =
                    texts.filter(x =>

                        x.trim() &&
                        x !== data.author &&
                        !x.includes('Thích') &&
                        !x.includes('Bình luận') &&
                        !x.includes('Phù hợp nhất')

                    )[0] || "";

            } catch {
                continue;
            }



            // ===== LINK BÀI VIẾT =====

            // ===== LINK BÀI VIẾT CHUẨN =====
            try {

                let postLink =
                    await post.locator(
                        'a[href*="/posts/"]'
                    ).first().getAttribute('href');

                if (postLink) {

                    // nếu href tương đối thì thêm domain
                    if (postLink.startsWith('/')) {
                        postLink =
                            'https://www.facebook.com' +
                            postLink;
                    }

                    // bỏ ?comment_id....
                    data.post_url =
                        postLink.split('?')[0];

                }

            } catch { }


            // ===== BÌNH LUẬN =====
            try {

                let btn =
                    post.locator(
                        'text=Bình luận'
                    ).first();


                if (await btn.count() > 0) {

                    await btn.click();

                    await page.waitForTimeout(
                        5000
                    );


                    let dialog =
                        page.locator(
                            'div[role="dialog"]'
                        ).last();


                    let commentBlocks =
                        await dialog.locator(
                            'div.xwib8y2.xpdmqnj.x1g0dm76.x1y1aw1k'
                        ).all();


                    let seenComments =
                        new Set();


                    for (let c of commentBlocks) {

                        try {

                            let commenter =
                                (
                                    await c.locator(
                                        'span.x1nxh6w3'
                                    ).first().innerText()
                                ).trim();


                            let commentText =
                                (
                                    await c.locator(
                                        'div[dir="auto"][style*="text-align"]'
                                    ).first().innerText()
                                ).trim();



                            if (
                                commenter &&
                                commentText &&
                                commenter !== commentText &&
                                !commenter.includes(
                                    'Confession'
                                ) &&
                                !commenter.includes(
                                    'Người tham gia'
                                )
                            ) {

                                let row =
                                    `${commenter}: ${commentText}`;


                                if (
                                    !seenComments.has(row)
                                ) {
                                    seenComments.add(
                                        row
                                    );

                                    data.comments.push(
                                        row
                                    );
                                }

                            }

                        } catch (e) { }

                    }



                    // ===== ĐÓNG POPUP =====
                    try {

                        let closeBtn =
                            page.locator(
                                '[aria-label="Đóng"],[aria-label="Close"]'
                            ).first();


                        if (
                            await closeBtn.count() > 0
                        ) {
                            await closeBtn.click();
                        }
                        else {
                            await page.keyboard.press(
                                'Escape'
                            );
                        }


                        await page.waitForTimeout(
                            1500
                        );

                    } catch { }

                }

            } catch (e) { }



            allPosts.push(data);

            console.log(
                "\n Bài " + (collected + 1)
            );

            console.log(
                JSON.stringify(
                    data,
                    null,
                    2
                )
            );


            collected++;

        }



        if (collected < MAX_POSTS) {

            await page.mouse.wheel(
                0,
                5000
            );

            await page.waitForTimeout(
                5000
            );

        }

    }



    console.log('\n====================');
    console.log(
        'Tổng số bài lấy được:',
        allPosts.length
    );
    console.log('====================');

    await browser.close();

    process.exit(0);

})();