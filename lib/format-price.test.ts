import test from "node:test";
import assert from "node:assert/strict";
import { formatPrice, extractNumericPrice, formatDelivery } from "./format-price";

test("formatPrice correctly replaces legacy DT with active workspace currency (DH)", () => {
  assert.equal(formatPrice("249 DT", "DH"), "249 DH");
  assert.equal(formatPrice("299 DT", "DH"), "299 DH");
  assert.equal(formatPrice("2536 MAD", "DH"), "2536 DH");
  assert.equal(formatPrice("249 TND", "DH"), "249 DH");
  assert.equal(formatPrice("189 DT", "DH"), "189 DH");
  assert.equal(formatPrice("249", "DH"), "249 DH");
  assert.equal(formatPrice("249.00", "DH"), "249.00 DH");
  assert.equal(formatPrice("16.000 DT", "DH"), "16.000 DH");
  assert.equal(formatPrice("0 DT", "DH"), "0 DH");
  assert.equal(formatPrice(199, "DH"), "199 DH");
  assert.equal(formatPrice(null, "DH"), "");
  assert.equal(formatPrice("", "DH"), "");
  assert.equal(formatPrice("—", "DH"), "");
});

test("formatPrice correctly formats prices for Tunisia workspace (DT)", () => {
  assert.equal(formatPrice("89 DT", "DT"), "89 DT");
  assert.equal(formatPrice("89", "DT"), "89 DT");
  assert.equal(formatPrice("89 TND", "DT"), "89 DT");
  assert.equal(formatPrice("49.000 دت", "DT"), "49.000 DT");
});

test("extractNumericPrice correctly extracts numeric component", () => {
  assert.equal(extractNumericPrice("249 DT"), "249");
  assert.equal(extractNumericPrice("2536 MAD"), "2536");
  assert.equal(extractNumericPrice("189.50 DT"), "189.50");
});

test("formatDelivery correctly formats delivery policies with dynamic currency symbol", () => {
  assert.equal(formatDelivery("Livraison: 7 DT", "DH"), "Livraison: 7 DH");
  assert.equal(formatDelivery("Livraison: 7 DT (Gratuite dès 2 pcs)", "DH"), "Livraison: 7 DH (Gratuite dès 2 pcs)");
  assert.equal(formatDelivery("Livraison Gratuite", "DH"), "Livraison Gratuite");
  assert.equal(formatDelivery("Gratuit", "DH"), "Livraison Gratuite");
  assert.equal(formatDelivery("7 DT", "DH"), "Livraison: 7 DH");
  assert.equal(formatDelivery("Livraison: 7 DT", "DT"), "Livraison: 7 DT");
});
