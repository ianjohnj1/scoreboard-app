# Supabase CORS Security Audit Plan

## Summary
The user pointed out a crucial misconception regarding Supabase CORS settings: there is no simple UI toggle for "Allowed Origins" for the main Data API (PostgREST). Instead of looking for a dashboard setting, restricting CORS requires executing an SQL command to configure the `authenticator` role directly. This plan will implement the correct SQL-based approach to lock down CORS.

## Current State Analysis
- The Supabase Data API currently allows cross-origin requests from any domain (`*`).
- The project is deployed to Cloudflare Pages at `https://scorekeeper-pro-d49.pages.dev`.
- Local development is run using Vite's default port at `http://localhost:5173`.

## Proposed Changes
**1. Create a CORS configuration SQL migration**
- **File:** `supabase/migrations/20260722_security_audit_cors.sql`
- **What/Why/How:** Write a new database migration that configures PostgREST to restrict CORS to our specific origins. The SQL will alter the `authenticator` role to set `pgrst.server_cors_allowed_origins` and then reload the PostgREST configuration.
  ```sql
  -- Restrict CORS for the Supabase Data API to the production domain and local dev environment
  ALTER ROLE authenticator SET pgrst.server_cors_allowed_origins = 'https://scorekeeper-pro-d49.pages.dev, http://localhost:5173';
  
  -- Reload the config to apply the changes immediately
  NOTIFY pgrst, 'reload config';
  ```

## Assumptions & Decisions
- **Decision:** We are hardcoding `https://scorekeeper-pro-d49.pages.dev` and `http://localhost:5173` as the allowed origins based on the latest deployment domains discovered in the project memory and Vite configuration.
- **Assumption:** Preview URLs on Cloudflare Pages (e.g., `https://<hash>.scorekeeper-pro-d49.pages.dev`) might be blocked by this exact string match. If preview deployments need access in the future, this setting can be updated to use a regular expression as supported by PostgREST. For now, exact strings provide the strictest security.

## Verification Steps
1. Push the migration to the Supabase database.
2. Verify that requests from `http://localhost:5173` and `https://scorekeeper-pro-d49.pages.dev` succeed.
3. Test a request from an unauthorized origin (e.g., via cURL or a different local port) and verify that the CORS preflight/request is rejected by Supabase.
