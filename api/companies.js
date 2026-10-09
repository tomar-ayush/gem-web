// GET /api/companies?q=&limit=50&offset=0  ->  { total, companies: [...] }
// Every seller found in the stored evaluations, grouped by cleaned name, most bids first.
import { TENDERS, PARTS, IS_L1, IS_QUALIFIED, run, int, text, ok, fail } from "../lib/sql.js";

const QUERY = `
WITH ${TENDERS}, ${PARTS},
co AS (
  SELECT k, count(*) AS bids,
         count(*) FILTER (WHERE ${IS_QUALIFIED}) AS tq,
         count(*) FILTER (WHERE ${IS_L1}) AS l1,
         coalesce(sum(price) FILTER (WHERE ${IS_L1}), 0) AS l1_value
  FROM part GROUP BY k
), f AS (SELECT * FROM co WHERE $1::text = '' OR position(upper($1::text) in k) > 0)
SELECT (SELECT count(*) FROM f) AS total,
       (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.bids DESC, p.l1 DESC, p.k), '[]'::jsonb)
        FROM (SELECT * FROM f ORDER BY bids DESC, l1 DESC, k LIMIT $2::int OFFSET $3::int) p) AS companies`;

export default async function handler(req, res) {
  const limit = int(req.query?.limit, 50, 1, 200);
  const offset = int(req.query?.offset, 0, 0, 10_000_000);
  try {
    const [row] = await run(QUERY, [text(req.query?.q), limit, offset]);
    return ok(res, { total: Number(row.total), companies: row.companies });
  } catch (error) {
    return fail(res, error);
  }
}
