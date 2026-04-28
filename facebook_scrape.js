const { chromium } = require('playwright');

(async () => {

    const browser = await chromium.launch({
        headless: false
    });

    const context = await browser.newContext({
        storageState: 'fb-session.json'
    });

    const page = await context.newPage();

    page.setDefaultTimeout(30000);

    await page.goto(
        'https://www.facebook.com/groups/mku.cfs',
        {
            waitUntil: 'domcontentloaded'
        }
    );

    await page.waitForTimeout(3000);

    const MAX_POSTS = 1;

    let collected = 0;
    let processed = new Set();



    while (collected < MAX_POSTS) {

        let posts = await page.locator(
            'div[role="feed"] div[aria-posinset]'
        ).all();


        for (let post of posts) {

            if (collected >= MAX_POSTS) break;

            let pid =
                await post.getAttribute(
                    'aria-posinset'
                );

            if (pid && processed.has(pid))
                continue;

            processed.add(pid);


            await post.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);



            let data = {
                author: "",
                content: "",
                post_url: "",
                comments: []
            };



            // AUTHOR - dùng evaluate để lấy text từ span có chứa "Bài viết của"
            // AUTHOR - Chiến thuật quét sâu
            try {
                const authorText = await post.evaluate((el) => {
                    // Cách 1: Tìm dựa trên nội dung text (Tiếng Việt)
                    const spans = Array.from(el.querySelectorAll('span'));
                    const authorLabel = spans.find(s => s.innerText.includes('Bài viết của'));

                    if (authorLabel) {
                        // Nếu text nằm chung trong 1 span kiểu "Bài viết của Tên"
                        if (authorLabel.innerText.length > 13) {
                            return authorLabel.innerText.replace('Bài viết của', '').trim();
                        }

                        // Nếu tên nằm ở span ngay kế bên (sibling)
                        const nextSpan = authorLabel.nextElementSibling;
                        if (nextSpan) return nextSpan.innerText.trim();

                        // Nếu tên nằm trong các thẻ con sâu hơn
                        return authorLabel.parentElement.innerText.replace('Bài viết của', '').trim();
                    }

                    // Cách 2: Dự phòng (Fallback) - Thường tên tác giả là link đầu tiên trong phần header
                    const firstLink = el.querySelector('h2 a, strong a, span[role="link"]');
                    return firstLink ? firstLink.innerText.trim() : '';
                });

                data.author = authorText;
            } catch (err) {
                console.log('Lỗi lấy author:', err.message);
                data.author = '';
            }

            // CONTENT
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
                        !x.includes('Bình luận')
                    )[0] || '';

            } catch {
                continue;
            }



            // LINK
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


            // COMMENTS
            try {

                let btn =
                    post.locator(
                        'text=Bình luận'
                    ).first();

                if (await btn.count()) {

                    await btn.click();

                    await page.waitForTimeout(
                        2000
                    );

                    let dialog =
                        page.locator(
                            'div[role="dialog"]'
                        ).last();


                    let blocks =
                        await dialog.locator(
                            'div.xwib8y2.xpdmqnj.x1g0dm76.x1y1aw1k'
                        ).all();


                    let seen =
                        new Set();


                    for (
                        let i = 0;
                        i < Math.min(
                            blocks.length,
                            5
                        );
                        i++
                    ) {

                        try {

                            let c = blocks[i];

                            let user =
                                (
                                    await c.locator(
                                        'span.x1nxh6w3'
                                    ).first().innerText()
                                ).trim();


                            let text =
                                (
                                    await c.locator(
                                        'div[dir="auto"][style*="text-align"]'
                                    ).first().innerText()
                                ).trim();


                            let row =
                                `${user}: ${text}`;


                            if (
                                user &&
                                text &&
                                !seen.has(row)
                            ) {
                                seen.add(row);
                                data.comments.push(row);
                            }

                        } catch { }

                    }


                    try {
                        await page.keyboard.press(
                            'Escape'
                        );
                    } catch { }

                }

            } catch { }



            console.log(
                '\n📦 Bài ' + (collected + 1)
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
                8000
            );

            await page.waitForTimeout(
                1500
            );

        }

    }


    console.log(
        `\n Tổng số bài: ${collected}`
    );

    await browser.close();

    process.exit(0);

})();