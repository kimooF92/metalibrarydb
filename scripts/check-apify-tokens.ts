import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getApifyTokens } from "../lib/apify";

async function check() {
  const tokens = getApifyTokens();
  console.log(`Found ${tokens.length} token(s) configured.`);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const masked = t.slice(0, 14) + "..." + t.slice(-4);
    try {
      const res = await fetch(`https://api.apify.com/v2/users/me/limits?token=${t}`);
      const json = await res.json();
      if (!res.ok) {
        console.log(`Token #${i + 1} [${masked}]: HTTP ${res.status} - ${JSON.stringify(json)}`);
      } else {
        const d = json.data;
        const max = d?.limits?.maxMonthlyUsageUsd ?? 0;
        const cur = d?.current?.monthlyUsageUsd ?? 0;
        const remaining = Math.max(0, max - cur);
        console.log(
          `Token #${i + 1} [${masked}]: Limit=$${max.toFixed(2)}, Used=$${cur.toFixed(2)}, Remaining=$${remaining.toFixed(2)}`
        );
      }
    } catch (e: any) {
      console.log(`Token #${i + 1} error: ${e.message}`);
    }
  }
}

check();
