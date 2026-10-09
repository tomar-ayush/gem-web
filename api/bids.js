// GET /api/bids?q=&ministry=&limit=50&offset=0  ->  { total, bids: [...], ministries: [...] }
// One page of tenders, newest first, for the list. A bid's tables come from /api/bid.
import { TENDERS, run, int, text, ok, fail } from "../lib/sql.js";

const QUERY = `
WITH ${TENDERS},
f AS (
  SELECT * FROM t
  WHERE ($1::text = '' OR ministry = $1::text)
    AND ($2::text = '' OR position(lower($2::text) in lower(concat_ws(' ', bid_number, ra_number, category, department, ministry))) > 0)
)
SELECT
  (SELECT count(*) FROM f) AS total,
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'bid_number', bid_number, 'ra_number', ra_number, 'is_ra', is_ra, 'category', category,
      'ministry', ministry, 'department', department, 'quantity', quantity, 'end_at', end_at,
      'n_tech', coalesce(jsonb_array_length(tech), 0), 'n_fin', coalesce(jsonb_array_length(fin), 0),
      'l1_seller', clean_name(l1->>'Seller Name'), 'l1_price', l1->>'Total Price'
    ) ORDER BY end_at DESC NULLS LAST, bid_number DESC), '[]'::jsonb)
   FROM (SELECT f.*, jsonb_path_query_first(f.fin, '$[*] ? (@.Rank like_regex "^L1([^0-9]|$)")') AS l1
         FROM f ORDER BY end_at DESC NULLS LAST, bid_number DESC LIMIT $3::int OFFSET $4::int) p) AS bids,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('name', ministry, 'n', n) ORDER BY ministry), '[]'::jsonb)
   FROM (SELECT ministry, count(*) AS n FROM t WHERE ministry <> '' GROUP BY ministry) m) AS ministries`;

export default async function handler(req, res) {
  const limit = int(req.query?.limit, 50, 1, 200);
  const offset = int(req.query?.offset, 0, 0, 10_000_000);
  try {
    const [row] = await run(QUERY, [text(req.query?.ministry), text(req.query?.q), limit, offset]);
    return ok(res, { total: Number(row.total), bids: row.bids, ministries: row.ministries });
  } catch (error) {
    return fail(res, error);
  }
}
