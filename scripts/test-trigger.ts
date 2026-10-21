import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { tasks } from "@trigger.dev/sdk";

async function main() {
  console.log("Triggering hello-world task via Trigger.dev Cloud...");
  const run = await tasks.trigger("hello-world", {
    message: "Meta Ad Library Tracker is online and connected!",
  });
  console.log("Task successfully dispatched! Run ID:", run.id);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
