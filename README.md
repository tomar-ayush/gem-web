# Procurement Insights (live)

A single page (`index.html`) and four Vercel functions that read the Neon database on the server. Every list is loaded one page at a time, so the page can show all of the data, not just a sample.

| Address | What it returns |
|---|---|
| `/api/bids?q=&ministry=&limit=50&offset=0` | One page of tenders (a bid with its reverse auction, or a bid on its own), newest first, with the total and the ministry list for the filter. |
| `/api/bid?id=<bid number>` | One tender with its details and every row of both evaluation tables. |
| `/api/companies?q=&limit=50&offset=0` | One page of sellers, grouped by cleaned name, with bids placed, technically qualified, ranked L1 and L1 value. |
| `/api/company?key=<name>` | One company: totals, buyers, competitors met most often and its full bid history. |

The page's addresses can be bookmarked and shared: `#/bids?page=3&size=100`, `#/bid/GEM%2F2026%2FB%2F7990213`, `#/companies?q=enterprises`, `#/company/<name>`.

## Deploy on Vercel

This folder is its own repository, so the project's **Root Directory stays blank** and the Framework Preset is **Other**.

1. Add the environment variable `DATABASE_URL` (Settings > Environment Variables) with the Neon connection string.
2. Push to GitHub. Vercel deploys on every push. After changing the variable, redeploy once.
3. Check `https://<your-project>.vercel.app/api/bids?limit=3`: it should return JSON with a `total`.

`vercel.json` runs the functions in Singapore (`sin1`), next to the Neon database.

`readonly-role.sql` is optional: it makes a database user that can only read the two tables the page needs. Use its connection string in `DATABASE_URL` if the database ever holds anything you care about.

## Things to know

- Answers are cached by Vercel for 60 seconds, so a busy page does not load the database each time.
- The company totals, the competitor counts and the ministry list are worked out in SQL from the stored pages on each request (about 0.3 to 1.5 seconds with 1,800 tenders). That is fine up to roughly 10,000 tenders. Beyond that the company queries approach Vercel's 10 second limit and should read the pipeline's `company_*` tables, which the nightly build fills.
- The buyer's name, address and contact are left out of every response.
- The page has no built-in sample data any more: it needs the API. The old static mockup is `ui-mockup.html` in the main project's `out/` folder.
- GitHub Pages cannot run the functions. Use Vercel (or Netlify or Cloudflare).
