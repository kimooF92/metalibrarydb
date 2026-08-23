import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { inArray } from "drizzle-orm";

async function inspectAds() {
  const ids = ["2066834761378818", "3890222947941003", "2089791301631673"];
  const list = await db.select().from(ads).where(inArray(ads.adArchiveId, ids));

  console.log("Ads with unknown mediaType:", list);
  process.exit(0);
}

inspectAds();
