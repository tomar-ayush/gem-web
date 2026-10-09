// GET /api/bid?id=GEM/2026/B/7990213  ->  one tender with its details and every row of both evaluation tables
import { TENDERS, run, text, ok, fail } from "../lib/sql.js";

// each seller row also carries _k, the cleaned name the company pages are keyed by
const withKey = (column) => `(
  SELECT coalesce(jsonb_agg(x || jsonb_build_object('_k', clean_name(x->>'Seller Name')) ORDER BY n), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(${column}, '[]'::jsonb)) WITH ORDINALITY e(x, n))`;

const QUERY = `
WITH ${TENDERS}
SELECT jsonb_build_object(
  'bid_number', bid_number, 'ra_number', ra_number, 'is_ra', is_ra, 'category', category,
  'ministry', ministry, 'department', department, 'quantity', quantity, 'end_at', end_at,
  'bid_details', coalesce(bid_details, '{}'::jsonb),
  'ra_details', coalesce(ra_details, '{}'::jsonb),
  -- the buyer's name, address and contact are public on GeM but are left out here, as the page says
  'buyer', jsonb_build_object('Ministry', coalesce(buyer->>'Ministry', ''), 'Department', coalesce(buyer->>'Department', ''),
                              'Organisation', coalesce(buyer->>'Organisation', ''), 'Office', coalesce(buyer->>'Office', '')),
  'technical', ${withKey("tech")},
  'financial', ${withKey("fin")},
  'notices', coalesce(notices, '[]'::jsonb)
) AS bid
FROM t WHERE bid_number = $1::text`;

export default async function handler(req, res) {
  const id = text(req.query?.id);
  if (!id) return res.status(400).json({ error: "id is required" });
  try {
    const rows = await run(QUERY, [id]);
    if (!rows.length) return res.status(404).json({ error: "no such bid" });
    return ok(res, rows[0].bid);
  } catch (error) {
    return fail(res, error);
  }
}
