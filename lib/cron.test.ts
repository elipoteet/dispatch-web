import { afterEach, describe, expect, it } from "vitest";
import { refuseCron } from "@/lib/cron";

const saved = { env: process.env.VERCEL_ENV, secret: process.env.CRON_SECRET };
afterEach(() => {
  if (saved.env === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = saved.env;
  process.env.CRON_SECRET = saved.secret;
});

const call = (auth?: string) => new Request("https://example.test/api/cron/screener", { headers: auth ? { authorization: auth } : {} });

describe("the scheduled jobs' gate", () => {
  it("runs on production with the secret, and refuses without it", () => {
    process.env.VERCEL_ENV = "production";
    process.env.CRON_SECRET = "s3cret";
    expect(refuseCron(call("Bearer s3cret"))).toBeNull();
    expect(refuseCron(call("Bearer wrong"))?.status).toBe(401);
    expect(refuseCron(call())?.status).toBe(401);
  });

  it("never runs on a preview deployment, even with the secret", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.CRON_SECRET = "s3cret";
    expect(refuseCron(call("Bearer s3cret"))?.status).toBe(403);
    process.env.VERCEL_ENV = "development";
    expect(refuseCron(call("Bearer s3cret"))?.status).toBe(403);
  });

  it("off Vercel, only the secret applies", () => {
    delete process.env.VERCEL_ENV;
    process.env.CRON_SECRET = "s3cret";
    expect(refuseCron(call("Bearer s3cret"))).toBeNull();
  });

  it("refuses everything when no secret is set", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.CRON_SECRET;
    expect(refuseCron(call("Bearer undefined"))?.status).toBe(401);
  });
});
