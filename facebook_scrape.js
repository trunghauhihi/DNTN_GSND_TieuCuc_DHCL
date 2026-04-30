const { chromium } = require('playwright');
const axios = require('axios');

(async () => {

    const WEBHOOK =
        'https://n8n.mku.edu.vn/webhook-test/facebook-monitor';
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
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

    const MAX_POSTS = 2;

    let collected = 0;
    let processed = new Set();
    let allPosts = [];


    while (collected < MAX_POSTS) {

        let posts =
            await page.locator(
                'div[role="feed"] div[aria-posinset]'
            ).all();


        for (let post of posts) {

            if (collected >= MAX_POSTS)
                break;


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



            /* AUTHOR */
            try {

                const authorText =
                    await post.evaluate(el => {

                        const spans =
                            Array.from(
                                el.querySelectorAll('span')
                            );

                        const label =
                            spans.find(
                                s => s.innerText.includes(
                                    'Bài viết của'
                                )
                            );

                        if (label) {

                            if (label.innerText.length > 13) {
                                return label.innerText
                                    .replace(
                                        'Bài viết của',
                                        ''
                                    )
                                    .trim();
                            }

                            if (label.nextElementSibling) {
                                return label
                                    .nextElementSibling
                                    .innerText
                                    .trim();
                            }

                            return label.parentElement
                                .innerText
                                .replace(
                                    'Bài viết của',
                                    ''
                                )
                                .trim();
                        }

                        const fallback =
                            el.querySelector(
                                'h2 a,strong a,span[role="link"]'
                            );

                        return fallback ?
                            fallback.innerText.trim() :
                            '';

                    });

                data.author = authorText;

            } catch {
                data.author = "";
            }



            /* CONTENT */
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

                if (!data.content)
                    continue;

            } catch {
                continue;
            }



            /* POST URL */
            try {

                let href =
                    await post.locator(
                        'a[href*="/posts/"]'
                    )
                        .first()
                        .getAttribute(
                            'href'
                        );

                if (href) {

                    if (
                        href.startsWith('/')
                    ) {
                        href =
                            'https://www.facebook.com' + href;
                    }

                    data.post_url =
                        href.split('?')[0];

                }

            } catch { }



            /* COMMENTS */
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
                            20
                        );
                        i++
                    ) {

                        try {

                            let c = blocks[i];

                            let user =
                                (
                                    await c.locator(
                                        'span.x1nxh6w3'
                                    ).first()
                                        .innerText()
                                ).trim();

                            let text =
                                (
                                    await c.locator(
                                        'div[dir="auto"][style*="text-align"]'
                                    )
                                        .first()
                                        .innerText()
                                ).trim();

                            let row =
                                `${user}: ${text}`;

                            if (
                                user &&
                                text &&
                                !seen.has(row)
                            ) {
                                seen.add(row);

                                data.comments.push(
                                    row
                                );
                            }

                        } catch { }

                    }


                    /* đóng popup */
                    try {
                        await page.keyboard.press(
                            'Escape'
                        );
                        await page.waitForTimeout(
                            1000
                        );
                    } catch { }

                }

            } catch { }



            allPosts.push(data);

            console.log(
                `\n Bài ${collected + 1}`
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



    /* GỬI N8N WEBHOOK */
    try {

        console.log('\nGửi dữ liệu sang n8n...');

        await axios.post(
            WEBHOOK,
            {
                total_posts: allPosts.length,
                scraped_at: new Date().toISOString(),
                posts: allPosts
            },
            {
                timeout: 10000
            }
        );

        console.log(' Gửi webhook thành công');

    }
    catch (e) {

        console.log(
            'Webhook lỗi:',
            e.message
        );

    }
    finally {

        console.log(
            `\n Tổng số bài: ${collected}`
        );

        await browser.close();

        process.exit(0);

    }


    console.log(
        `\n Tổng số bài: ${collected}`
    );

    await browser.close();

    process.exit(0);

})();