# Plan: Fix Blank Screen After Refresh

The blank screen and routing issues after a refresh are caused by a missing import in `Dashboard.tsx` and a race condition in the global routing logic.

## Current State Analysis
- **ReferenceError**: `Dashboard.tsx` uses `useCallback` but does not import it from `react`. This crashes the app on mount.
- **Race Condition**: `AppRoutes` in `App.tsx` makes routing decisions (like redirects) before `AuthProvider` has finished restoring the user session from `localStorage`.

## Proposed Changes

### 1. Fix Dashboard.tsx
- **File**: `src/pages/Dashboard.tsx`
    - Add `useCallback` to the `react` imports.
    - Remove the redundant `useEffect` that navigates to `/login`, as this is already handled by the `ProtectedRoute` wrapper in `App.tsx`.
    - Update the loading guard to rely on the shared `authLoading` state.

### 2. Fix App.tsx
- **File**: `src/App.tsx`
    - Update the `AppRoutes` component to check the `loading` state from `useAuth()`.
    - If `loading` is true, show a global loading spinner instead of rendering routes. This prevents the catch-all redirect from firing prematurely.

## Verification Steps
1. **Verify Blank Screen Fix**:
    - Refresh the browser while on the Dashboard.
    - Verify the blank screen is gone and the dashboard loads correctly.
2. **Verify Session Persistence**:
    - Refresh the browser while logged in.
    - Verify you are NOT redirected to the login page and remain on your current page.
3. **Verify Protected Routes**:
    - Logout and try to access `/` directly.
    - Verify you are correctly redirected to `/login`.
