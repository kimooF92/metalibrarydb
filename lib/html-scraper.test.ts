import test from "node:test";
import assert from "node:assert/strict";
import { isPriceString, isTrackingBeacon, parseProductHtmlContent } from "./html-scraper";

test("isPriceString correctly identifies prices vs actual titles", () => {
  // Price patterns that should be flagged
  assert.equal(isPriceString("49.000 دت \r\n 68.600 دت"), true);
  assert.equal(isPriceString("49.000 دت"), true);
  assert.equal(isPriceString("39 DT"), true);
  assert.equal(isPriceString("29.900 TND"), true);
  assert.equal(isPriceString("120 د.ت"), true);
  assert.equal(isPriceString("49,00 €"), true);
  assert.equal(isPriceString("$29.99"), true);
  assert.equal(isPriceString("24.900 دت / 34.860 دت"), true);

  // Real product titles that should NOT be flagged
  assert.equal(isPriceString("La bouilloire magique"), false);
  assert.equal(isPriceString("⭐Tondeuse éléctrique ⭐"), false);
  assert.equal(isPriceString("لكمة التنين ثلاثية الأبعاد"), false);
  assert.equal(isPriceString("Pack Patchs désodorisants pour chaussures"), false);
  assert.equal(isPriceString("متر ليزري متعدد الوظائف PIA LV-05"), false);
  assert.equal(isPriceString("Casquette LED avec Bluetooth"), false);
});

test("isTrackingBeacon correctly identifies tracking pixels and ad beacons", () => {
  assert.equal(
    isTrackingBeacon("https://www.facebook.com/tr?id=559262387202926&ev=PageView&noscript=1"),
    true
  );
  assert.equal(isTrackingBeacon("https://analytics.tiktok.com/i18n/pixel/events.js"), true);
  assert.equal(isTrackingBeacon("https://www.google-analytics.com/collect"), true);
  assert.equal(isTrackingBeacon("https://store.tn/assets/pixel.png"), true);
  assert.equal(
    isTrackingBeacon(
      "https://store.tn/assets/img.png",
      '<img width="1" height="1" style="display:none" src="https://store.tn/assets/img.png">'
    ),
    true
  );

  // Legitimate product images
  assert.equal(
    isTrackingBeacon("https://tunideal.stocki.tn/assets/img/produit/image_1788027559_0.webp"),
    false
  );
  assert.equal(
    isTrackingBeacon("https://cdn.shopify.com/s/files/1/0001/products/sample.jpg"),
    false
  );
});

test("parseProductHtmlContent extracts Stocki / COD form inputs and ignores h1 price badges", () => {
  const stockiHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>tunideal</title>
      </head>
      <body>
        <img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=123&ev=PageView" />
        <div class="header">
          <h3>⭐Tondeuse éléctrique ⭐</h3>
          <h1>
            <span id="total1">49.000 دت</span>
            <span style="text-decoration: line-through;">68.600 دت</span>
          </h1>
        </div>
        <div class="product-images">
          <img src="https://tunideal.stocki.tn/assets/img/produit/image_1788027559_0.webp" alt="Product" />
        </div>
        <form>
          <input type="hidden" name="name" value="⭐Tondeuse éléctrique ⭐">
          <input type="hidden" name="price" id="prices" value="49.000">
          <input type="hidden" name="frais" id="frais" value="7.000">
        </form>
      </body>
    </html>
  `;

  const res = parseProductHtmlContent(stockiHtml, "https://tunideal.store/detail-1161");
  assert.equal(res.success, true);
  assert.equal(res.data?.title, "⭐Tondeuse éléctrique ⭐");
  assert.equal(res.data?.current_price, "49 DT");
  assert.equal(res.data?.original_price, "68.6 DT");
  assert.equal(
    res.data?.main_image_url,
    "https://tunideal.stocki.tn/assets/img/produit/image_1788027559_0.webp"
  );
});

test("parseProductHtmlContent preserves standard Shopify / WooCommerce JSON-LD extraction", () => {
  const shopifyHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": "Classic Leather Shoes",
            "image": "https://cdn.shopify.com/products/shoes.jpg",
            "offers": {
              "@type": "Offer",
              "price": "149.00",
              "priceCurrency": "TND"
            }
          }
        </script>
      </head>
      <body>
        <h1>Classic Leather Shoes</h1>
      </body>
    </html>
  `;

  const res = parseProductHtmlContent(shopifyHtml, "https://example-shoes.com/products/leather");
  assert.equal(res.success, true);
  assert.equal(res.data?.title, "Classic Leather Shoes");
  assert.equal(res.data?.current_price, "149 DT");
  assert.equal(res.data?.main_image_url, "https://cdn.shopify.com/products/shoes.jpg");
});
