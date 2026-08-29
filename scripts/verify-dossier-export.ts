import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { trackedPages } from "../db/schema";
import { generateBrandDossierPrompt, DossierPersona } from "../lib/brand-dossier-exporter";

async function main() {
  console.log("=== Testing Brand Dossier Prompt Generator ===");

  // Find an existing tracked page in DB
  const [samplePage] = await db.select().from(trackedPages).limit(1);

  if (!samplePage) {
    console.log("⚠️ No tracked pages found in database to test with. Exiting test.");
    process.exit(0);
  }

  console.log(`Testing with Page: ${samplePage.displayName || samplePage.pageId} (ID: ${samplePage.id})`);

  const personas: DossierPersona[] = ["strategic", "media_buyer", "product_scout", "counter_intel"];

  for (const persona of personas) {
    console.log(`\n--- Testing Persona: ${persona} ---`);
    const result = await generateBrandDossierPrompt(samplePage.id, persona);

    console.log(`✓ Metadata:`, {
      displayName: result.meta.displayName,
      persona: result.meta.persona,
      totalScans: result.meta.totalScans,
      totalProducts: result.meta.totalProducts,
      totalAds: result.meta.totalAdsObserved,
      currentResults: result.meta.currentResults,
    });

    console.log(`✓ Prompt Length: ${result.markdownPrompt.length} characters`);
    console.log(`✓ Prompt Preview (First 350 chars):\n${result.markdownPrompt.slice(0, 350)}...\n`);

    // Verify key sections exist
    if (!result.markdownPrompt.includes("## 1. BRAND & TRACKING PROFILE")) {
      throw new Error("Missing Section 1 in prompt output");
    }
    if (!result.markdownPrompt.includes("## 2. COMPUTED INTELLIGENCE SIGNALS")) {
      throw new Error("Missing Section 2 in prompt output");
    }
    if (!result.markdownPrompt.includes("## 3. CHRONOLOGICAL AD VELOCITY TIMELINE")) {
      throw new Error("Missing Section 3 in prompt output");
    }
    if (!result.markdownPrompt.includes("## 7. REQUIRED ANALYSIS & REPORTING DIRECTIVES")) {
      throw new Error("Missing Section 7 in prompt output");
    }
  }

  console.log("\n🎉 All persona tests passed with 100% valid prompt output!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
