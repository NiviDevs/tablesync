# Infrastructure

Run `npm run demo` from the repository root for local use. For the cloud demo,
follow [Kubernetes setup](k8s/README.md). PostgreSQL migrations live in
`postgres/migrations`; their runner records checksums and preserves history.
Supabase migrations contain historical demo data and are not the active path.
