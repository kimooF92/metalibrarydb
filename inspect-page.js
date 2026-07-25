const { chromium } = require('playwright');

async function testPageNameExtraction() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const testUrl = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&view_all_page_id=103899805401833";
  await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });
  
  const content = await page.content();
  
  let pageName = null;
  const match = content.match(/"page_name"\s*:\s*"([^"]+)"/);
  if (match && match[1]) {
    try {
      // Decode JSON unicode string e.g. \u0645\u0646...
      pageName = JSON.parse(`"${match[1]}"`);
    } catch {
      pageName = match[1];
    }
  }
  
  console.log("EXTRACTED PAGE NAME FROM META METADATA:", pageName);
  await browser.close();
}

testPageNameExtraction().catch(console.error);
