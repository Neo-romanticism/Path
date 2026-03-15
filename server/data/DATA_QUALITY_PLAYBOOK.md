# University Data Quality Playbook

This playbook aims for high-quality admissions data using only public and licensed sources.
It does not include copying or scraping paid third-party proprietary datasets.

## 1) Source strategy

- Prefer official, structured sources first.
- Use multiple sources for the same university/department to improve confidence.
- Keep immutable raw snapshots for each collection run.

Recommended source order:

1. University Alimi style datasets
2. Adiga style datasets
3. University admission office public data

## 2) Required fields per record

- university
- department
- category
- admissionsType
- at least one score among percentile, convertedCut, gpaCut
- sourceId
- sourceUrl
- year
- confidence

## 3) Confidence guideline

- 0.95 to 1.00: official structured source, clearly versioned
- 0.90 to 0.94: official source with minor transformation
- 0.85 to 0.89: reliable portal source with stable schema
- below 0.85: keep for review only, excluded by default policy

## 4) Run sequence

1. npm run univ:bootstrap
2. Fill server/data/source-manifest.json with real public URLs and set enabled=true for targets
3. npm run univ:collect
4. npm run univ:report
5. npm run univ:export
6. npm run validate:universities

If you do not have URL lists yet, start with offline seed:

1. npm run univ:cli -- seed-from-builtin --source builtin-seed-2026 --year 2026 --replace true
2. npm run univ:report
3. npm run univ:export
4. npm run validate:universities

Then progressively replace seeded data with real public sources via collect/import-url.

## 5) Quality gates (suggested)

- trustedRecords >= 5000
- rejected rate <= 15%
- top universities covered by 2+ sources
- all records for target year include sourceUrl

## 6) Ops checklist

- Review server/data/university-rejects.json after each collect/export run
- Fix mapping template if reject reasons show field mismatch
- Keep one backup of server/data/universities.real.json per successful release
- Re-run full pipeline after trust policy changes
