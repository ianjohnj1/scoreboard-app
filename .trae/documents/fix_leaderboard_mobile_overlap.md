# Pre-Deployment Security Audit & Hardening Plan

## Executive Summary

This document outlines the current security posture of the application, detailing the architectural trade-offs made to support the custom PIN-based authentication system. Per our discussion, we are acknowledging the open API risk for now and focusing on immediate frontend hardening to protect local data and prevent brute-force attempts.

## 1. Current State: API Vulnerability (Accepted Risk)

* **The Trade-Off**: To support custom frontend PIN auth without standard Supabase email/password sessions, the Row Level Security (RLS) policies were modified to `USING (true) WITH CHECK (true)`.

* **The Risk**: Anyone possessing the Supabase URL and Anon Key can interact directly with the REST API to read, insert, update, or delete any record in the database.

* **The Decision**: As a single-user / closed-group application, this API risk is accepted for now to maintain the current user experience.

* **Future Action (Deferred)**: A ticket should be created to migrate to **Custom JWTs**. This will allow the backend to generate a secure token upon PIN verification and use strict `auth.uid()` policies, fully securing the API without changing the frontend PIN login UX.

## 2. Frontend Hardening (Immediate Implementation Plan)

While the API remains open, we must harden the frontend to prevent accidental corruption, local tampering, and data leakage.

### A. Data Minimization (Local Storage Sanitization)

* **Vulnerability**: Currently, `LoginPage.tsx` uses `select('*')` and passes the entire profile object—including the sensitive `pin_hash`—into `localStorage` via the `AuthContext`.

* **Mitigation**:

  * Update `LoginPage.tsx` to strip the `pin_hash` from the profile object before passing it to `login()`.

  * Update `AuthContext.tsx` to ensure `pin_hash` is never saved to `localStorage` under the `sk_user` key.

### B. Local Brute-Force Deterrence

* **Vulnerability**: The PIN login form can be rapidly submitted, allowing someone with physical access to a device to quickly guess a 4-digit PIN.

* **Mitigation**: Add an artificial delay (e.g., `500ms` or `1000ms`) during failed login attempts in `LoginPage.tsx` to mathematically deter basic local brute-force guessing.

### C. Input Validation & UI Safety

* **Vulnerability**: Usernames and Display Names might accept arbitrary characters or excessive lengths, which could break UI layouts.

* **Mitigation**: Add strict `maxLength` attributes (e.g., 20 characters for usernames) to the `LoginPage` inputs to enforce structural constraints and prevent malicious or accidental layout breaking.

## Proposed Changes

1. **`src/pages/LoginPage.tsx`**:

   * Add `delete profile.pin_hash;` before calling `await login(profile);`.

   * Add `await new Promise(resolve => setTimeout(resolve, 800));` inside the `if (error || !profile)` block to slow down failed login attempts.

   * Add `maxLength={20}` to username and display name inputs.
2. **`src/contexts/AuthContext.tsx`**:

   * Add a safety check in `login()` to `delete profile.pin_hash` before `JSON.stringify()`.

## Verification Steps

1. Attempt to log in with an incorrect PIN and verify that the UI hangs for roughly 1 second before showing the "Invalid username or PIN" alert.
2. Log in successfully and inspect the browser's Local Storage (`sk_user`). Verify that the `pin_hash` field is no longer present in the stored JSON object.

