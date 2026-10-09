// GET /api/bids?limit=100  ->  { bids: [...] }
// The latest awarded reverse auctions, each one an RA page joined to its parent bid page, shaped like the sample records in index.html.
// The database address comes from the DATABASE_URL setting on the server and never reaches the browser.
import { neon } from "@neondatabase/serverless";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;
const MAX_TABLE_ROWS = 100; // one tender can have hundreds of sellers; the page only needs a view of them

const rows = (section) => `(
  SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb)
  FROM jsonb_array_elements(${section}->'tables'->0->'rows') WITH ORDINALITY t(x, n)
  WHERE n <= $2)`;

const QUERY = `
WITH ra AS (
  SELECT r.b_id, r.bid_number, r.parsed, l.doc
  FROM stg_result r JOIN stg_listing l ON l.b_id = r.b_id
  WHERE NOT r.not_found AND r.bid_number IS NOT NULL AND r.parsed->'sections' ? 'ra_details'
    AND r.parsed->'sections' ? 'financial_evaluation'
), parent AS (
  SELECT DISTINCT ON (bid_number) b_id, bid_number, parsed
  FROM stg_result
  WHERE NOT not_found AND bid_number IS NOT NULL
    AND parsed->'sections' ? 'bid_details' AND parsed->'sections' ? 'technical_evaluation'
  ORDER BY bid_number, b_id
)
SELECT jsonb_build_object(
  'b_id', ra.b_id,
  'parent_id', parent.b_id,
  'ra_number', ra.parsed->'sections'->'ra_details'->>'number',
  'bid_number', ra.bid_number,
  'category', coalesce(ra.doc->'b_category_name'->>0, ''),
  'ministry', coalesce(ra.doc->'ba_official_details_minName'->>0, ''),
  'department', coalesce(ra.doc->'ba_official_details_deptName'->>0, ''),
  'quantity', coalesce((ra.doc->'b_total_quantity'->>0)::numeric, 0),
  'bid_details', coalesce(parent.parsed->'sections'->'bid_details'->'details', '{}'::jsonb),
  'ra_details', coalesce(ra.parsed->'sections'->'ra_details'->'details', '{}'::jsonb),
  -- the buyer's name, address and contact are public on GeM but are left out here, as the page says
  'buyer', jsonb_build_object(
    'Ministry', coalesce(ra.parsed->'sections'->'ra_details'->'buyer'->>'Ministry', ''),
    'Department', coalesce(ra.parsed->'sections'->'ra_details'->'buyer'->>'Department', ''),
    'Organisation', coalesce(ra.parsed->'sections'->'ra_details'->'buyer'->>'Organisation', ''),
    'Office', coalesce(ra.parsed->'sections'->'ra_details'->'buyer'->>'Office', '')),
  'technical', ${rows("parent.parsed->'sections'->'technical_evaluation'")},
  'financial', ${rows("ra.parsed->'sections'->'financial_evaluation'")},
  'notices', coalesce(ra.parsed->'notices', '[]'::jsonb)
) AS bid
FROM ra JOIN parent USING (bid_number)
ORDER BY ra.doc->'final_end_date_sort'->>0 DESC NULLS LAST, ra.b_id DESC
LIMIT $1`;

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: "DATABASE_URL is not set on the server" });
  }
  const wanted = parseInt(req.query?.limit ?? DEFAULT_LIMIT, 10);
  const limit = Math.min(Math.max(Number.isFinite(wanted) ? wanted : DEFAULT_LIMIT, 1), MAX_LIMIT);
  try {
    const sql = neon(process.env.DATABASE_URL);
    const result = await sql.query(QUERY, [limit, MAX_TABLE_ROWS]);
    // the edge cache answers repeat visits, so a busy page does not wake or load the database each time
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
    return res.status(200).json({ source: "neon", count: result.length, bids: result.map((r) => r.bid) });
  } catch (error) {
    console.error("bids query failed:", error.message);
    return res.status(500).json({ error: "the database did not answer" });
  }
}
