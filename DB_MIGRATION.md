Two related tasks. Do them in this order, in a single working session.

== Task 1: Remove the parent PIN feature entirely ==

1. Find every reference to PIN, parent_settings, verify-pin, and PinGate in src/. Use:
     grep -rn "pin\|Pin\|PIN\|parent_settings\|verify-pin\|PinGate" src/
   Review what comes back and form a removal plan.

2. Delete the PinGate component file and any PIN-related hooks.

3. In the parent route(s), remove the PIN gate wrapper. The /parent page should
   just render directly. Do NOT add any other auth in its place — Phase 1 is
   single-user on a personal device.

4. Remove any imports, types, or utility functions that are now orphaned.

5. Delete the supabase/functions/verify-pin/ directory if it exists in the repo.

6. Do NOT drop the map_parent_settings table or the map_verify_parent_pin
   database function. Leave them in the schema. They're inert without UI calling
   them and removing them is a separate, reversible decision.

7. Run `npm run build` (or `tsc -b --noEmit` if that's the project's check) and
   confirm it passes. Run `npm run dev` and confirm the app loads, the home
   page works, and /parent renders without a PIN prompt.

== Task 2: Cut the app over to the new Supabase project ==

The app currently points at source project `mnrseaapxpofdznnqrsv`. We're moving
it to destination project `klhzfwxpztaojekwgzcg`. The destination already has
all schema, data, and functions — verified by row-count diff.

1. Get the destination project's URL and anon (publishable) key. The user will
   provide them. Do not guess. URL format is
   `https://klhzfwxpztaojekwgzcg.supabase.co`. Anon key starts with either
   `eyJ...` (JWT) or `sb_publishable_...` (newer format).

2. Update `.env.local` at the repo root:
     VITE_SUPABASE_URL=<destination URL>
     VITE_SUPABASE_ANON_KEY=<destination anon key>
     SUPABASE_URL=<destination URL>
     SUPABASE_PUBLISHABLE_KEY=<destination anon key>
   Keep .env.local gitignored.

3. Update `.env.example` to reflect the four variable names with placeholder
   values (no real keys committed).

4. Run the smoke tests:
   - `npm run dev` — load home, confirm questions exist, start a math test,
     answer 2-3 questions, confirm the runner advances and records attempts.
   - `node scripts/grade3-coverage.mjs` — confirm it returns counts matching
     the destination (pre-cutover the user verified: 45 standards, 841
     questions, etc.)
   - `node scripts/grade3-author-prompt.mjs --subject math --teks 3.3F --band 191_200`
     — confirm it produces output without errors.

5. Reality-check that the new attempts are landing in the destination DB by
   asking the user to verify in Supabase dashboard.

6. Update CLAUDE.md §2: change the Supabase project ref from
   `mnrseaapxpofdznnqrsv` to `klhzfwxpztaojekwgzcg`.

7. Commit both tasks as separate commits with clear messages:
     "Remove parent PIN feature" and
     "Migrate Supabase project to klhzfwxpztaojekwgzcg".

== What NOT to do ==

- Do NOT redeploy to Vercel from this session. Leave the production URL pointed
  at the old project until the user manually updates Vercel env vars and
  triggers redeploy. They want one more local-verified day before flipping
  production.
- Do NOT drop or modify any data on either Supabase project. Read-only on the
  databases; the migration is already complete.
- Do NOT remove map_parent_settings or map_verify_parent_pin from either
  database. Schema stays as-is.

Stop and ask before doing anything that doesn't fit the above.
