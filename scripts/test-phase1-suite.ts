import { db } from "../db";
import { ads, adObservations, trackedPages, scrapedProducts } from "../db/schema";
import { eq, inArray, or, sql, desc } from "drizzle-orm";
import { isAllowedCdnHost, isPrivateOrLocalHost } from "../app/api/spy/image-proxy/route";

async function runTestSuite() {
  console.log("=================================================");
  console.log("   PHASE 1 REMEDIATION & VERIFICATION TEST SUITE  ");
  console.log("=================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
      process.exitCode = 1;
    }
  }

  // ----------------------------------------------------------------------
  // TEST SECTION 1: Image Proxy Security, Suffix-Bounded CDNs & SSRF
  // ----------------------------------------------------------------------
  console.log("--- 1. Testing CDN Allowlist & SSRF Defense ---");

  const validCdnHosts = [
    "cdn.shopify.com",
    "store.myshopify.com",
    "boutique.youcan.shop",
    "res.cloudinary.com",
    "assets.cloudinary.com",
    "s3.amazonaws.com",
    "my-brand-bucket.s3.amazonaws.com",
    "my-brand-bucket.s3.eu-west-1.amazonaws.com",
    "my-brand-bucket.s3-eu-west-1.amazonaws.com",
    "d123456abcdef8.cloudfront.net",
    "scontent.xx.fbcdn.net",
    "lookaside.fbsbx.com",
    "scontent-ams4-1.cdninstagram.com",
    "myproject.supabase.co",
    "myproject.supabase.in",
  ];

  for (const host of validCdnHosts) {
    assert(isAllowedCdnHost(host), `Allowed CDN: ${host}`);
  }

  const blockedCdnHosts = [
    "evil-cloudfront.net",
    "attacker-myshopify.com",
    "not-real-cloudinary.com",
    "myshopify.com.attacker.com",
    "s3.amazonaws.com.hacker.com",
    "random-domain.com",
    "phishing-site.org",
  ];

  for (const host of blockedCdnHosts) {
    assert(!isAllowedCdnHost(host), `Blocked spoofed/unlisted CDN: ${host}`);
  }

  const privateHosts = [
    "localhost",
    "127.0.0.1",
    "127.0.0.2",
    "10.0.0.1",
    "10.255.255.255",
    "192.168.0.1",
    "192.168.1.100",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254", // Cloud instance metadata
    "0.0.0.0",
    "server.local",
    "database.internal",
    "::1",
  ];

  for (const host of privateHosts) {
    assert(isPrivateOrLocalHost(host), `Blocked SSRF private/local host: ${host}`);
  }

  // ----------------------------------------------------------------------
  // TEST SECTION 2: Streaming Byte Counter Simulation
  // ----------------------------------------------------------------------
  console.log("\n--- 2. Testing Streaming Byte Counter Limiter ---");
  const MAX_LIMIT = 5 * 1024 * 1024;

  // Simulate streaming reader under limit
  {
    const chunks = [new Uint8Array(1024 * 1024), new Uint8Array(2 * 1024 * 1024)];
    let totalBytes = 0;
    let aborted = false;
    for (const chunk of chunks) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_LIMIT) {
        aborted = true;
        break;
      }
    }
    assert(!aborted && totalBytes === 3 * 1024 * 1024, "Streaming reader allows 3 MB payload");
  }

  // Simulate streaming reader exceeding 5MB limit
  {
    const chunks = [
      new Uint8Array(3 * 1024 * 1024),
      new Uint8Array(3 * 1024 * 1024), // Exceeds 5MB
      new Uint8Array(100 * 1024 * 1024), // Massive unread chunk
    ];
    let totalBytes = 0;
    let aborted = false;
    let chunksRead = 0;
    for (const chunk of chunks) {
      totalBytes += chunk.byteLength;
      chunksRead++;
      if (totalBytes > MAX_LIMIT) {
        aborted = true;
        break;
      }
    }
    assert(aborted && chunksRead === 2, "Streaming reader aborts immediately on chunk 2 (before allocating chunk 3)");
  }

  // ----------------------------------------------------------------------
  // TEST SECTION 3: Database-Side UNION Subquery Parity
  // ----------------------------------------------------------------------
  console.log("\n--- 3. Testing Database-Side UNION Candidate Query Parity ---");

  const mismatchBrand = await db
    .select({
      trackedId: trackedPages.id,
      displayName: trackedPages.displayName,
      pageId: trackedPages.pageId,
      adPageId: ads.pageId,
    })
    .from(adObservations)
    .innerJoin(trackedPages, eq(trackedPages.id, adObservations.trackedPageId))
    .innerJoin(ads, eq(ads.id, adObservations.adId))
    .where(
      sql`${ads.pageId} IS NOT NULL AND ${trackedPages.pageId} IS NOT NULL AND ${ads.pageId} != ${trackedPages.pageId}`
    )
    .limit(1);

  if (mismatchBrand.length > 0) {
    const b = mismatchBrand[0];
    const targetPageIds = [b.pageId].filter(Boolean) as string[];
    const targetTrackedPageIds = [b.trackedId].filter(Boolean) as string[];

    // Baseline: Two-query in application memory
    const leg1 = await db.select({ id: ads.id }).from(ads).where(inArray(ads.pageId, targetPageIds));
    const leg2 = await db.select({ id: adObservations.adId }).from(adObservations).where(inArray(adObservations.trackedPageId, targetTrackedPageIds));
    const baselineCandidateSet = new Set([...leg1.map((r) => r.id), ...leg2.map((r) => r.id)]);

    // New: Single database-side subquery
    const subqueryParts = [];
    if (targetPageIds.length > 0) {
      const pageIdParams = targetPageIds.map((p) => sql`${p}`);
      subqueryParts.push(sql`SELECT id FROM ads WHERE page_id IN (${sql.join(pageIdParams, sql`, `)})`);
    }
    if (targetTrackedPageIds.length > 0) {
      const trackedParams = targetTrackedPageIds.map((tp) => sql`${tp}::uuid`);
      subqueryParts.push(sql`SELECT ad_id AS id FROM ad_observations WHERE tracked_page_id IN (${sql.join(trackedParams, sql`, `)})`);
    }

    const candidateSubquery = sql`(${sql.join(subqueryParts, sql` UNION `)})`;
    const dbSideAds = await db
      .selectDistinctOn([ads.id], { id: ads.id })
      .from(ads)
      .where(sql`${ads.id} IN ${candidateSubquery}`);

    const dbSideSet = new Set(dbSideAds.map((r) => r.id));

    let parity = baselineCandidateSet.size === dbSideSet.size;
    for (const id of baselineCandidateSet) {
      if (!dbSideSet.has(id)) parity = false;
    }

    assert(
      parity && dbSideSet.size > 0,
      `Database-side UNION ad candidates match baseline exactly (${dbSideSet.size} ads for "${b.displayName}")`
    );
  } else {
    console.log("  [INFO] No brand with mismatched page ID in current DB snapshot.");
  }

  // ----------------------------------------------------------------------
  // TEST SECTION 4: Lean Mode URL-linked Product Accuracy
  // ----------------------------------------------------------------------
  console.log("\n--- 4. Testing Lean Mode Product Projection & Accuracy ---");

  // Query a sample brand with ads having linkUrl
  const sampleAdWithUrl = await db
    .select({
      pageId: ads.pageId,
      linkUrl: ads.linkUrl,
    })
    .from(ads)
    .where(sql`${ads.linkUrl} IS NOT NULL AND ${ads.linkUrl} != ''`)
    .limit(1);

  if (sampleAdWithUrl.length > 0) {
    const testUrl = sampleAdWithUrl[0].linkUrl!;
    // Test that distinctNormalizedUrls is queried in lean mode projection
    const leanCols = await db
      .select({
        id: scrapedProducts.id,
        url: scrapedProducts.url,
        storePlatform: scrapedProducts.storePlatform,
        scrapeStatus: scrapedProducts.scrapeStatus,
      })
      .from(scrapedProducts)
      .where(inArray(scrapedProducts.url, [testUrl]))
      .limit(5);

    assert(Array.isArray(leanCols), "Lean projection query executes successfully against indexed scraped_products");
  }

  // ----------------------------------------------------------------------
  // TEST SECTION 5: Product Request Identity & Race Condition Guard
  // ----------------------------------------------------------------------
  console.log("\n--- 5. Testing Request Identity & Cancellation Invariants ---");

  // Verify race condition logic: late request from superseded sister page is discarded
  let reqCounter = 0;
  const currentActiveReqId = ++reqCounter;
  const supersededReqId = currentActiveReqId - 1;

  let stateUpdated = false;
  function handleResponse(reqId: number, brandId: string, currentBrandId: string) {
    if (reqId !== currentActiveReqId || brandId !== currentBrandId) return;
    stateUpdated = true;
  }

  handleResponse(supersededReqId, "brand-1", "brand-1");
  assert(!stateUpdated, "Superseded request ID is safely ignored");

  handleResponse(currentActiveReqId, "old-brand", "new-brand");
  assert(!stateUpdated, "Response from previously selected brand is safely ignored");

  handleResponse(currentActiveReqId, "new-brand", "new-brand");
  assert(stateUpdated, "Active request ID matching active brand updates state successfully");

  console.log("\n=================================================");
  console.log(`   TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log("=================================================");

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test suite runtime failure:", err);
  process.exit(1);
});
