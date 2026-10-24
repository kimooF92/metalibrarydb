import test from "node:test";
import assert from "node:assert/strict";
import { validateAndGatekeepProduct } from "./product-validator";

test("validateAndGatekeepProduct rejects obvious junk pages at Layer 1 ($0 tokens)", async () => {
  const policyCheck = await validateAndGatekeepProduct({
    url: "https://store.tn/policies/privacy-policy",
    title: "Politique de confidentialité",
  });
  assert.equal(policyCheck.isProduct, false);
  assert.equal(policyCheck.status, "ignored");
  assert.match(policyCheck.reason || "", /deterministic regex/i);

  const cartCheck = await validateAndGatekeepProduct({
    url: "https://store.tn/cart",
    title: "Panier d'achat - Finaliser la commande",
  });
  assert.equal(cartCheck.isProduct, false);
  assert.equal(cartCheck.status, "ignored");

  const termsCheck = await validateAndGatekeepProduct({
    url: "https://store.tn/pages/terms-of-service",
    title: "Conditions Générales de Vente",
  });
  assert.equal(termsCheck.isProduct, false);
  assert.equal(termsCheck.status, "ignored");
});

test("validateAndGatekeepProduct passes genuine products at Layer 2 ($0 tokens)", async () => {
  const genuineCheck = await validateAndGatekeepProduct({
    url: "https://store.tn/products/montre-connectee-ultra-series-9",
    title: "Montre Connectée Ultra Series 9 Smartwatch",
    rawPrice: "89 DT",
    mainImageUrl: "https://store.tn/images/watch.jpg",
  });
  assert.equal(genuineCheck.isProduct, true);
  assert.equal(genuineCheck.status, "success");
  assert.match(genuineCheck.reason || "", /genuine product/i);
});

test("validateAndGatekeepProduct rejects pages without price, image, or product slug ($0 tokens)", async () => {
  const emptyCheck = await validateAndGatekeepProduct({
    url: "https://random-store.com",
    title: "Some Random Store Header",
    rawPrice: null,
    mainImageUrl: null,
  });
  assert.equal(emptyCheck.isProduct, false);
  assert.equal(emptyCheck.status, "ignored");
  assert.match(emptyCheck.reason || "", /insufficient product evidence/i);
});

test("validateAndGatekeepProduct rejects generic navigation titles without slug ($0 tokens)", async () => {
  const navCheck = await validateAndGatekeepProduct({
    url: "https://boutique-tn.com",
    title: "Accueil - Notre Boutique en ligne",
    rawPrice: "49 DT",
    mainImageUrl: "https://boutique-tn.com/banner.jpg",
  });
  assert.equal(navCheck.isProduct, false);
  assert.equal(navCheck.status, "ignored");
  assert.match(navCheck.reason || "", /generic navigation title/i);
});

test("validateAndGatekeepProduct does not auto-pass micro-prices (<=10) or foreign currency at Layer 2", async () => {
  const deliveryCheck = await validateAndGatekeepProduct({
    url: "https://store.tn/products/some-item",
    title: "Pack Découverte Offre Spéciale",
    rawPrice: "7 DT", // micro-price / delivery fee
    mainImageUrl: "https://store.tn/images/pack.jpg",
  });
  // Layer 2 confident product must NOT pass micro-prices automatically
  assert.notEqual(deliveryCheck.reason, "Confirmed genuine product (confident local price, product slug, image, descriptive title)");

  const foreignCheck = await validateAndGatekeepProduct({
    url: "https://store.com/products/headphones",
    title: "Wireless ANC Bluetooth Headphones",
    rawPrice: "$19.99", // foreign price
    mainImageUrl: "https://store.com/images/headphones.jpg",
  });
  // Foreign prices must not pass Layer 2 as local confirmed success
  assert.notEqual(foreignCheck.reason, "Confirmed genuine product (confident local price, product slug, image, descriptive title)");
});
