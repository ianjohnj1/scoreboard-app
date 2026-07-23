-- Unify PIN hashing: LoginPage.tsx previously hashed PINs with no salt while
-- lib/auth.ts hashes with a salted scheme, so pin_hash values across existing
-- profiles are inconsistent and cannot be told apart. Clear them so every
-- account is forced through a one-time self-service PIN re-set (handled by
-- loginWithPin() in src/lib/auth.ts, which accepts any PIN when pin_hash is
-- NULL and stores it under the salted scheme going forward).

UPDATE profiles SET pin_hash = NULL;
