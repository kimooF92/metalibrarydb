import test from "node:test";
import assert from "node:assert/strict";
import { classifyProductOffline } from "./product-classifier";
import { PRODUCT_CATEGORIES } from "./product-categories";
import {
  NICHE_TAXONOMY,
  getNicheByDbCategory,
  getSubNicheDisplayLabel,
  resolveNicheDbCategories,
  resolveSubNicheDbValues,
} from "./niches-taxonomy";
import { DECISION_SUBNICHE_CRITERIA, SUBNICHE_TO_CATEGORY_MAP } from "./typesafe-jev";

test("PRODUCT_CATEGORIES includes 'Pet Supplies'", () => {
  assert.ok(PRODUCT_CATEGORIES.includes("Pet Supplies"));
});

test("classifyProductOffline accurately identifies French, English, and Arabic pet products", () => {
  const dogBed = classifyProductOffline("Lit pour chien apaisant lavable");
  assert.equal(dogBed.category, "Pet Supplies");
  assert.equal(dogBed.subCategory, "Pet Beds & Furniture");

  const catTree = classifyProductOffline("Arbre à chat avec griffoir en sisal");
  assert.equal(catTree.category, "Pet Supplies");
  assert.equal(catTree.subCategory, "Pet Beds & Furniture");

  const leash = classifyProductOffline("Laisse rétractable pour grand chien");
  assert.equal(leash.category, "Pet Supplies");
  assert.equal(leash.subCategory, "Pet Leashes & Harnesses");

  const waterFountain = classifyProductOffline("Fontaine à eau automatique pour chat et chien");
  assert.equal(waterFountain.category, "Pet Supplies");
  assert.equal(waterFountain.subCategory, "Pet Feeding & Bowls");

  const petToy = classifyProductOffline("Balle interactive jouet pour chiot");
  assert.equal(petToy.category, "Pet Supplies");
  assert.equal(petToy.subCategory, "Pet Toys & Training");

  const petGrooming = classifyProductOffline("Brosse de toilettage anti-poils pour chien et chat");
  assert.equal(petGrooming.category, "Pet Supplies");
  assert.equal(petGrooming.subCategory, "Pet Grooming & Hygiene");

  const arabicPet = classifyProductOffline("طوق تدريب الكلاب مع جهاز تحكم");
  assert.equal(arabicPet.category, "Pet Supplies");
  assert.equal(arabicPet.subCategory, "Pet Leashes & Harnesses");

  const englishPet = classifyProductOffline("Self cleaning litter box for cats");
  assert.equal(englishPet.category, "Pet Supplies");
  assert.equal(englishPet.subCategory, "Pet Grooming & Hygiene");
});

test("Pet supplies do not accidentally match human beauty or home decor", () => {
  const dogShampoo = classifyProductOffline("Shampoing doux démêlant pour chien");
  assert.equal(dogShampoo.category, "Pet Supplies");

  const catBrush = classifyProductOffline("Brosse magique pour chat");
  assert.equal(catBrush.category, "Pet Supplies");

  const dogClipper = classifyProductOffline("Tondeuse silencieuse pour chien et chat");
  assert.equal(dogClipper.category, "Pet Supplies");
});

test("TypeSafe Jev sub-niche maps and criteria include Pet Supplies", () => {
  assert.equal(SUBNICHE_TO_CATEGORY_MAP["Pet Beds & Furniture"], "Pet Supplies");
  assert.equal(SUBNICHE_TO_CATEGORY_MAP["Pet Grooming & Hygiene"], "Pet Supplies");
  assert.equal(SUBNICHE_TO_CATEGORY_MAP["Pet Leashes & Harnesses"], "Pet Supplies");
  assert.equal(SUBNICHE_TO_CATEGORY_MAP["Pet Feeding & Bowls"], "Pet Supplies");
  assert.equal(SUBNICHE_TO_CATEGORY_MAP["Pet Toys & Training"], "Pet Supplies");

  assert.ok(DECISION_SUBNICHE_CRITERIA["Pet Beds & Furniture"]);
  assert.ok(DECISION_SUBNICHE_CRITERIA["Pet Grooming & Hygiene"]);
  assert.ok(DECISION_SUBNICHE_CRITERIA["Pet Leashes & Harnesses"]);
  assert.ok(DECISION_SUBNICHE_CRITERIA["Pet Feeding & Bowls"]);
  assert.ok(DECISION_SUBNICHE_CRITERIA["Pet Toys & Training"]);
});

test("NICHE_TAXONOMY handles Pet Supplies lookup and resolution", () => {
  const niche = getNicheByDbCategory("Pet Supplies");
  assert.ok(niche);
  assert.equal(niche.id, "pet-supplies");
  assert.equal(niche.label, "Pet Supplies");
  assert.equal(niche.icon, "PawPrint");

  const dbCats = resolveNicheDbCategories("pet-supplies");
  assert.deepEqual(dbCats, ["Pet Supplies"]);

  const display = getSubNicheDisplayLabel("Pet Beds & Furniture");
  assert.equal(display, "Beds & Furniture");

  const subValues = resolveSubNicheDbValues("pet-beds-furniture");
  assert.ok(subValues.includes("Pet Beds & Furniture"));
  assert.ok(subValues.includes("Pet Beds"));
});

