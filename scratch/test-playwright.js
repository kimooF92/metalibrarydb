const { chromium } = require('playwright');

async function testPageNameExtraction() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const testUrl = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&q=%22fikra.com.tn%22&search_type=keyword_exact_phrase&sort_data[direction]=desc&sort_data[mode]=total_impressions";
  
  console.log("Navigating...");
  await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });
  
  console.log("Waiting 5s...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("--- BODY TEXT ---");
  console.log(bodyText.substring(0, 1000)); // Log first 1000 chars
  
  const hasCaptchaElement = (await page.$('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha_dialog')) !== null;
  const hasCaptchaText = /confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain/i.test(bodyText);
  
  console.log("hasCaptchaElement:", hasCaptchaElement);
  console.log("hasCaptchaText:", hasCaptchaText);
  
  await browser.close();
}

testPageNameExtraction().catch(console.error);
