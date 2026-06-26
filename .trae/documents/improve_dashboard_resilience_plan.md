# Plan: Improve Dashboard Resilience and Error Handling

The application is currently logging multiple network errors (`net::ERR_INTERNET_DISCONNECTED`, `net::ERR_NETWORK_IO_SUSPENDED`) in the console, but these are not handled in the UI. This leads to a poor user experience where the dashboard remains empty or stuck if a fetch fails.

## Current State Analysis

- **Dashboard.tsx**: Fetches data using `Promise.all` but only logs errors to the console.
- **Loading State**: The `loading` state is cleared in `finally`, but if an error occurs, the user just sees an empty dashboard.
- **Network Errors**: Common errors like `Failed to fetch` (Internet disconnected) or `IO Suspended` (Device sleep) are not handled gracefully.

## Proposed Changes

### 1. `src/pages/Dashboard.tsx`
- Add an `error` state to track data fetching failures.
- Update `loadDashboardData` to catch and set the `error` state.
- Implement a user-friendly error display when data fails to load.
- Add a "Retry" button to allow users to manually refresh when the connection is restored.
- Specifically handle `AbortError` or `IO Suspended` errors to avoid showing intrusive errors if the request was just cancelled by navigation or sleep.

### 2. Error Detection Logic
- Create a helper to identify "retriable" network errors vs. "permanent" errors.
- Display a specific "No Internet Connection" message if `navigator.onLine` is false.

## Verification Plan

1. **Simulate Offline**: Use browser dev tools to simulate "Offline" mode and verify the dashboard shows a "No Internet Connection" error with a retry button.
2. **Restore Connection**: Re-enable network and click "Retry", verifying that data loads correctly.
3. **Simulate Error**: Manually trigger a mock error in `loadDashboardData` to verify the error UI renders correctly.
4. **Navigation Test**: Rapidly navigate away from the dashboard while it's loading to ensure no "update on unmounted component" or intrusive error messages appear (handled by existing `isMounted` pattern).
