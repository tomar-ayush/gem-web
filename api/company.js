// GET /api/company?key=SWASTIK ENTERPRISES  ->  totals, buyers, rivals and the full bid history of one company
import { TENDERS, PARTS, IS_L1, IS_QUALIFIED, run, text, ok, fail } from "../lib/sql.js";

const QUERY = `
WITH ${TENDERS}, ${PARTS},
mine AS (
  SELECT p.*, t.ra_number, t.category, t.ministry, t.end_at, p.tx->>'Status' AS tech_status, p.fx->>'Rank' AS rnk
  FROM part p JOIN t USING (bid_number) WHERE p.k = $1::text
), agg AS (
  SELECT count(*) AS bids,
         count(*) FILTER (WHERE ${IS_QUALIFIED}) AS tq,
         count(*) FILTER (WHERE ${IS_L1}) AS l1,
         coalesce(sum(price) FILTER (WHERE ${IS_L1}), 0) AS l1_value
  FROM mine
)
SELECT jsonb_build_object(
  'key', $1::text, 'bids', agg.bids, 'tq', agg.tq, 'l1', agg.l1, 'l1_value', agg.l1_value,
  'ministries', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', ministry, 'n', n) ORDER BY n DESC, ministry), '[]'::jsonb)
                 FROM (SELECT ministry, count(*) AS n FROM mine GROUP BY ministry ORDER BY n DESC, ministry LIMIT 10) m),
  'rivals', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', n) ORDER BY n DESC, k), '[]'::jsonb)
             FROM (SELECT p.k, count(*) AS n FROM part p WHERE p.bid_number IN (SELECT bid_number FROM mine) AND p.k <> $1::text
                   GROUP BY p.k ORDER BY n DESC, p.k LIMIT 10) r),
  'history', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'bid_number', bid_number, 'ra_number', ra_number, 'category', category, 'ministry', ministry,
                'end_at', end_at, 'tech_status', tech_status, 'rank', rnk, 'price', price
              ) ORDER BY end_at DESC NULLS LAST, bid_number), '[]'::jsonb) FROM mine)
) AS company FROM agg`;

export default async function handler(req, res) {
  const key = text(req.query?.key);
  if (!key) return res.status(400).json({ error: "key is required" });
  try {
    const [row] = await run(QUERY, [key]);
    if (!row.company.bids) return res.status(404).json({ error: "no such company" });
    return ok(res, row.company);
  } catch (error) {
    return fail(res, error);
  }
}
