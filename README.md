This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

> See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the app is put together.

## Environment variables

Set these in `.env.local` for local development, and in the Vercel project's
environment variables for production.

```
# Supabase (auth + Postgres)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only — never prefix NEXT_PUBLIC, never import into a client component

# Market data
TWELVE_DATA_API_KEY
TIINGO_API_KEY                 # price-history fallback when Twelve Data is rate-limited/down
FINNHUB_API_KEY

# Alerts cron
CRON_SECRET                    # verifies requests to /api/cron/alerts and /api/cron/digest actually come from Vercel Cron

# Site
NEXT_PUBLIC_SITE_URL           # https://www.dispatchresearch.com

# Notification emails (phase two, Part B) — a Resend API key, distinct from the SMTP
# credentials configured in the Supabase dashboard for sign-in codes. Powers
# pushback/reply/weekly-digest emails (lib/email/resend.ts); sends quietly no-op without it.
RESEND_API_KEY
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
