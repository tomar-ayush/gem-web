# Web mockup

`index.html` is the Procurement Insights mockup. Served with its API it shows the latest 100 awarded reverse auctions from Neon; opened anywhere else (a gist, a local file) it shows its 20 built-in samples.

`api/bids.js` is a Vercel function that reads Neon on the server. The database address is a server setting and never reaches the browser.

## Deploy on Vercel

1. In the Neon SQL editor run `readonly-role.sql` (pick a password). Build the connection string for the `gem_web` user: copy your project's connection string and change the user and password.
2. In Vercel: **Add New > Project**, import this repository, set **Root Directory** to `web`, **Framework Preset** to **Other**.
3. Add the environment variable `DATABASE_URL` with the `gem_web` connection string, for Production and Preview.
4. Deploy, then open `https://<your-project>.vercel.app/api/bids?limit=3`. It should return JSON.

Or from a terminal: `cd web && npx vercel` (asks you to log in), then `npx vercel env add DATABASE_URL` and `npx vercel --prod`.

`vercel.json` runs the function in Singapore (`sin1`), next to the Neon database, so each query is fast.

## Run it locally

`npx vercel dev` in this folder (needs the same login and `DATABASE_URL` in `web/.env.local`).

## Things to know

- GitHub Pages and a gist cannot run `api/bids.js`. They show the static sample only.
- Repeat visits are served from Vercel's cache for 60 seconds, so a busy page does not load the database every time.
- The buyer's name, address and contact are left out of the response, as the page says.
- Each response carries at most 300 bids (`?limit=`), and each evaluation table at most 100 sellers.
- The company totals are worked out in the browser from the bids it received. That is right for a mockup with a few hundred bids and not for millions: a real version needs those totals from SQL.
