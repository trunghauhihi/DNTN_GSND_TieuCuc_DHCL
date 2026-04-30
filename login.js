const { chromium } = require('playwright');

(async () => {

  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext();

  const page = await context.newPage();

  await page.goto('https://facebook.com');

  console.log('Đăng nhập Facebook xong nhấn Enter trong terminal');

  process.stdin.once('data', async () => {

    await context.storageState({
      path: 'fb-session.json'
    });

    console.log('Đã lưu session');

    await browser.close();

  });

})();