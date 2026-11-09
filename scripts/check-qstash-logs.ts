import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getQstashClient } from "../lib/qstash";

async function main() {
  const client = getQstashClient();
  if (!client) {
    console.error("No QStash client configured.");
    return;
  }

  console.log("Fetching recent QStash events...");
  const res = await (client as any).events({ limit: 20 });
  console.log(`Retrieved ${res.events?.length || 0} events:\n`);

  for (const e of (res.events || []).slice(0, 10)) {
    console.log(`[${e.state}] ${new Date(e.time).toISOString()}`);
    console.log(`  Message ID: ${e.messageId}`);
    console.log(`  URL:        ${e.url}`);
    if ((e as any).responseStatus) console.log(`  HTTP Status: ${(e as any).responseStatus}`);
    if (e.error) console.log(`  Error:       ${e.error}`);
    console.log("---");
  }
}

main().catch(console.error);

