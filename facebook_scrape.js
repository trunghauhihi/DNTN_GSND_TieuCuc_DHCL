const { chromium } = require('playwright');
const axios = require('axios');

(async () => {
    const WEBHOOK = 'https://n8n.mku.edu.vn/webhook-test/facebook-monitor';
    const MAX_POSTS = 30;          
    const SCROLL_STEP = 5000;     
    const SCROLL_DELAY = 1500;    

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({ storageState: 'fb-session.json' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    await page.goto('https://www.facebook.com/groups/mku.cfs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    let collected = 0;          // Số bài hợp lệ đã lấy
    let processed = new Set();   // ID bài đã xử lý
    let validPosts = [];         // Mảng chứa bài viết hợp lệ
    let lastHeight = 0;

    while (collected < MAX_POSTS) {
        // Lấy tất cả bài viết hiện tại trong feed
        let posts = await page.locator('div[role="feed"] div[aria-posinset]').all();

        for (let post of posts) {
            if (collected >= MAX_POSTS) break;

            let pid = await post.getAttribute('aria-posinset');
            if (pid && processed.has(pid)) continue;
            processed.add(pid);

            await post.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);

            let data = { author: "", content: "", post_url: "", comments: [] };

            // ----- Lấy tác giả -----
            try {
                let authorText = await post.evaluate(el => {
                    const spans = Array.from(el.querySelectorAll('span'));
                    const label = spans.find(s => s.innerText.includes('Bài viết của'));
                    if (label) {
                        if (label.innerText.length > 13) return label.innerText.replace('Bài viết của', '').trim();
                        if (label.nextElementSibling) return label.nextElementSibling.innerText.trim();
                        return label.parentElement.innerText.replace('Bài viết của', '').trim();
                    }
                    const fallback = el.querySelector('h2 a, strong a, span[role="link"]');
                    return fallback ? fallback.innerText.trim() : '';
                });
                data.author = authorText || "Ẩn danh";
            } catch { data.author = "Ẩn danh"; }

            // ----- Lấy nội dung bài viết -----
            try {
                let texts = await post.locator('div[dir="auto"]').allInnerTexts();
                data.content = texts.find(t => t.trim() && !t.includes('Thích') && !t.includes('Bình luận')) || '';
                if (!data.content) continue;   // không có nội dung -> bỏ qua
            } catch { continue; }

            // ----- Lấy URL bài viết (BẮT BUỘC PHẢI CÓ) -----
            let urlOk = false;
            try {
                let href = await post.locator('a[href*="/posts/"]').first().getAttribute('href');
                if (href) {
                    if (href.startsWith('/')) href = 'https://www.facebook.com' + href;
                    data.post_url = href.split('?')[0];
                    urlOk = true;
                }
            } catch { }
            
            // Nếu không có URL -> bỏ qua bài này, không tăng collected
            if (!urlOk) {
                console.log(`Bỏ qua bài (thiếu URL): ${data.content.substring(0, 60)}...`);
                continue;
            }

            // ----- Lấy bình luận (nếu có nút "Bình luận") -----
            try {
                let btn = post.locator('text=Bình luận').first();
                if (await btn.count()) {
                    await btn.click();
                    await page.waitForTimeout(2000);
                    let dialog = page.locator('div[role="dialog"]').last();
                    let blocks = await dialog.locator('div.xwib8y2.xpdmqnj.x1g0dm76.x1y1aw1k').all();
                    let seen = new Set();
                    for (let i = 0; i < Math.min(blocks.length, 20); i++) {
                        try {
                            let user = (await blocks[i].locator('span.x1nxh6w3').first().innerText()).trim();
                            let text = (await blocks[i].locator('div[dir="auto"][style*="text-align"]').first().innerText()).trim();
                            let row = `${user}: ${text}`;
                            if (user && text && !seen.has(row)) {
                                seen.add(row);
                                data.comments.push(row);
                            }
                        } catch { }
                    }
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(1000);
                }
            } catch { }

            // ----- Hợp lệ: thêm vào danh sách -----
            validPosts.push(data);
            collected++;
            console.log(`\nThu thập thành công bài ${collected}:`);
            console.log(`   URL: ${data.post_url}`);
        }

        // Cuộn trang nếu chưa đủ số lượng bài yêu cầu
        if (collected < MAX_POSTS) {
            let newHeight = await page.evaluate(() => document.body.scrollHeight);
            if (newHeight === lastHeight) {
                console.log("Đã cuộn đến cuối trang, không còn bài viết mới.");
                break;
            }
            lastHeight = newHeight;
            await page.mouse.wheel(0, SCROLL_STEP);
            await page.waitForTimeout(SCROLL_DELAY);
        }
    }

    // Gửi dữ liệu đến n8n nếu có bài viết hợp lệ
    if (validPosts.length > 0) {
        try {
            console.log(`\nBắt đầu gửi ${validPosts.length} bài viết đến webhook...`);
            await axios.post(WEBHOOK, {
                total_posts: validPosts.length,
                scraped_at: new Date().toISOString(),
                posts: validPosts
            }, { timeout: 10000 });
            console.log('Gửi webhook thành công!');
        } catch (e) {
            console.error(' Lỗi gửi webhook:', e.message);
        }
    } else {
        console.log(" Không có bài viết nào có URL, dừng xử lý.");
    }

    await browser.close();
    process.exit(0);
})();