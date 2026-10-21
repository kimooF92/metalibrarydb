import { defineConfig } from "@trigger.dev/sdk";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_hobqenpzlvvjvnksgpoj",
  dirs: ["./src/trigger"],
  maxDuration: 1800, // 30 minutes
  build: {
    external: ["playwright", "playwright-core", "chromium-bidi"],
    extensions: [playwright()],
  },
});
