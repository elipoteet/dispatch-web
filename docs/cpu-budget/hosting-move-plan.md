# Moving off Vercel: a rough plan (18 November 2026)

For Eli, in case he decides not to wait for Vercel. Nothing here has been started.

## The short answer

- **Neither host runs this site for free.** Every research page needs 70 to 240 ms of CPU to build.
  - Cloudflare's free Workers plan allows 10 ms of CPU per request.
  - Netlify's free plan has 300 credits a month, and each production deploy costs 15 of them.
- **The cheapest paid options:** Cloudflare Workers Paid ($5 a month, the price from memory; check it) or Netlify Personal ($9 a month, 1,000 credits).
- **The only free path I can see** is to stay on Vercel Hobby, with `fix/cpu-budget` merged and the account unpaused by Vercel support.
- **If Eli moves anyway:** Netlify is the shorter move, at about **1½ days** of work plus up to two days for the domain to switch. Cloudflare is about **3 days** plus the same wait.

## What each host would need

| | Netlify | Cloudflare |
|---|---|---|
| Free plan fits? | No. 300 credits a month: a deploy costs 15, compute 10 per GB-hour of function time, requests 2 per 10,000. Twenty deploys use the month's credits. | No. Free Workers stop at 10 ms of CPU per request; this site needs 70–240 ms per research page. |
| Cheapest plan that fits | Personal, $9 a month, 1,000 credits | Workers Paid (from $5 a month; check the current price and what's included) |
| Running Next.js 16 | Netlify's Next.js runtime, set up automatically. First check it supports Next 16 with Turbopack builds. | The OpenNext adapter (`@opennextjs/cloudflare`). Check Next 16 support. The cache (`unstable_cache`, revalidation) needs its own storage set up (R2 or KV), and Node APIs need the `nodejs_compat` flag. |
| Nightly jobs | Scheduled functions stop at 30 seconds; the screener job takes 100. Move both jobs to GitHub Actions. | Cron Triggers allow 15 minutes on the paid plan, but the job's Node code would need checking on Workers. GitHub Actions is simpler. |
| Domain | Add the domain in Netlify, point the DNS records at it, wait for the certificate | Easiest with Cloudflare as the DNS host: move the nameservers, wait up to 48 hours |

## The steps, either host

1. **Jobs to GitHub Actions first** (about half a day; worth doing even on Vercel, since it takes them off the CPU bill):
   - The screener job already runs as a plain Node script (it did for every manual rerun).
   - A scheduled workflow runs it nightly, with the Supabase service key and `SEC_CONTACT_EMAIL` as repository secrets. Then it calls `/api/revalidate/screener` with `CRON_SECRET` so the cached pages refresh.
   - The alerts job needs pulling out of its route into a script the same way.
   - Note: scheduled workflows can start late, and GitHub turns them off after 60 days without a commit.
2. **Set up the new host** (Netlify half a day, Cloudflare a day and a half):
   - Connect the GitHub repository, so master deploys production and branches get previews.
   - Copy the environment variables: the Supabase URL and keys, `SEC_CONTACT_EMAIL`, the Twelve Data, Finnhub and Tiingo keys, `CRON_SECRET`.
   - Add the redirects from `next.config.ts` (they move with the code) and check the proxy runs.
3. **Test on the host's own address** (half a day):
   - Every research tab, the screener, the custom links and the starting screens; sign in, the watchlist and the alerts.
   - The caching: cached pages must come from the host's cache, not be rebuilt per visit.
4. **Move the domain:**
   - Lower the DNS records' time-to-live a day ahead, then point dispatchresearch.com and www at the new host and wait for its certificate.
   - Supabase's site URL and sign-in redirect addresses stay the same, because the domain does.
   - Check where the domain is registered first: if it was bought through Vercel, it has to be transferred out or have its DNS pointed elsewhere.
5. **Keep Vercel as it is until the new host has served a full day,** then remove the project there.

## What I'd do

Wait for Vercel support to unpause the account, merge `fix/cpu-budget`, and turn AI crawlers away in the Firewall. Then let the daily usage check show whether the site now fits.

Move the jobs to GitHub Actions only if the numbers say the site is still close to the limit. Move hosts only if it still doesn't fit after levers B or C in the CPU recap, or if Vercel won't unpause.
