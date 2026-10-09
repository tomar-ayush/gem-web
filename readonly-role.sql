-- Run once in the Neon SQL editor, as the project owner. Choose your own long random password.
-- The web function connects as this user, so a mistake or a leak of its URL can only read two tables.
CREATE ROLE gem_web LOGIN PASSWORD 'CHOOSE_A_LONG_RANDOM_PASSWORD';
GRANT USAGE ON SCHEMA public TO gem_web;
GRANT SELECT ON stg_result, stg_listing TO gem_web;
-- Check it worked: connect as gem_web and run   select count(*) from stg_result;
-- Check it is read-only: this must fail with "permission denied"   delete from stg_result;
