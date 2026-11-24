import { beforeEach } from "vitest";
import { clearApiCache, setCacheClock } from "../src/apiCache";
import { resetQuotaForTests } from "../src/quota";

// Each test starts with an empty GitHub response cache and the real clock.
beforeEach(async () => {
  setCacheClock(() => Date.now());
  await clearApiCache();
  resetQuotaForTests();
});
