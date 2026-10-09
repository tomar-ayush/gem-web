// Shared by the functions in api/. The database address comes from the DATABASE_URL setting on the server.
import { neon } from "@neondatabase/serverless";

// One row per tender (a bid, with its reverse auction when it has one), built from the pages the pipeline stored.
// The bid's own page has the bid details and the technical evaluation, the RA page has the RA details and the financial
// evaluation; a bid without an RA has both tables on its own page.
export const TENDERS = `
pages AS (
  SELECT r.b_id, r.bid_number, r.parsed->'sections' AS s, r.parsed->'notices' AS notices, l.doc
  FROM stg_result r LEFT JOIN stg_listing l ON l.b_id = r.b_id
  WHERE NOT r.not_found AND r.bid_number IS NOT NULL
), bidp AS (
  SELECT DISTINCT ON (bid_number) * FROM pages WHERE s ? 'bid_details' ORDER BY bid_number, b_id
), rap AS (
  SELECT DISTINCT ON (bid_number) * FROM pages WHERE s ? 'ra_details' ORDER BY bid_number, b_id DESC
), base AS (
  SELECT bid_number,
         rap.s->'ra_details'->>'number' AS ra_number,
         rap.b_id IS NOT NULL AS is_ra,
         coalesce(rap.s->'ra_details'->'buyer', bidp.s->'bid_details'->'buyer') AS buyer,
         bidp.s->'bid_details'->'details' AS bid_details,
         rap.s->'ra_details'->'details' AS ra_details,
         rap.notices AS notices,
         coalesce(rap.doc, bidp.doc) AS doc,
         bidp.s->'technical_evaluation'->'tables'->0->'rows' AS tech,
         coalesce(rap.s->'financial_evaluation'->'tables'->0->'rows', bidp.s->'financial_evaluation'->'tables'->0->'rows') AS fin
  FROM bidp FULL JOIN rap USING (bid_number)
), t AS (
  SELECT base.*,
         coalesce(doc->'b_category_name'->>0, '') AS category,
         coalesce(doc->'ba_official_details_minName'->>0, buyer->>'Ministry', '') AS ministry,
         coalesce(doc->'ba_official_details_deptName'->>0, buyer->>'Department', '') AS department,
         (doc->'b_total_quantity'->>0)::numeric AS quantity,
         doc->'final_end_date_sort'->>0 AS end_at
  FROM base
)`;

// One row per seller per tender, the technical row and the financial row of the same company joined by its cleaned name.
export const PARTS = `
tech AS (
  SELECT t.bid_number, clean_name(x->>'Seller Name') AS k, (array_agg(x))[1] AS x
  FROM t, jsonb_array_elements(coalesce(t.tech, '[]'::jsonb)) x
  WHERE coalesce(clean_name(x->>'Seller Name'), '') <> ''
  GROUP BY 1, 2
), fin AS (
  SELECT t.bid_number, clean_name(x->>'Seller Name') AS k, (array_agg(x))[1] AS x
  FROM t, jsonb_array_elements(coalesce(t.fin, '[]'::jsonb)) x
  WHERE coalesce(clean_name(x->>'Seller Name'), '') <> ''
  GROUP BY 1, 2
), part AS (
  SELECT coalesce(a.bid_number, b.bid_number) AS bid_number, coalesce(a.k, b.k) AS k, a.x AS tx, b.x AS fx,
         nullif(replace(substring(b.x->>'Total Price' FROM '[0-9][0-9,]*\\.?[0-9]*'), ',', ''), '')::numeric AS price
  FROM tech a FULL JOIN fin b ON a.bid_number = b.bid_number AND a.k = b.k
)`;

// the same tests the page used when it worked on 20 samples: L1 rank, and "qualified" but not "disqualified"
export const IS_L1 = `(fx->>'Rank') ~ '^L1([^0-9]|$)'`;
export const IS_QUALIFIED = `(tx IS NULL OR ((tx->>'Status') ~* 'qualified' AND (tx->>'Status') !~* 'disqualified'))`;

export async function run(text, params) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set on the server");
  return neon(process.env.DATABASE_URL).query(text, params);
}

export function int(value, fallback, min, max) {
  const n = parseInt(value, 10);
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, min), max);
}

export function text(value) {
  return String(Array.isArray(value) ? value[0] : value ?? "").slice(0, 200);
}

// a repeat visit is answered from Vercel's cache, so a busy page does not wake or load the database each time
export function ok(res, body) {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  return res.status(200).json(body);
}

export function fail(res, error) {
  console.error("query failed:", error.message);
  const missing = /DATABASE_URL/.test(error.message);
  return res.status(500).json({ error: missing ? error.message : "the database did not answer" });
}
