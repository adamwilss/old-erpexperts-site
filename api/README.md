# SEO Status API Notes

- `seo-statuses.php` is the canonical interface for roadmap statuses.
- `seo-statuses.json` is persistent storage read/written by the PHP endpoint.
- Frontend clients should write through `seo-statuses.php` only.
- Direct JSON reads are fallback-only when PHP is unavailable.
