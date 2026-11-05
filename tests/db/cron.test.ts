import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/daily/route";

const enabled = !!(process.env.CRON_SECRET && process.env.SUPABASE_SECRET_KEY);

describe.skipIf(!enabled)("cron /api/cron/daily", () => {
  it("refuses requests without the secret", async () => {
    expect((await GET(new Request("http://x/api/cron/daily"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });
  it("runs with the secret and is safe to run twice (one became_overdue event per invoice)", async () => {
    const auth = { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } };
    const first = await GET(new Request("http://x/api/cron/daily", auth));
    expect(first.status).toBe(200);
    const second = await (await GET(new Request("http://x/api/cron/daily", auth))).json();
    expect(second.ok).toBe(true);
    expect(second.newly_overdue).toBe(0);
  });
});
