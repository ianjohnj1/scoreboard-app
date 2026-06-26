# Plan: Fix Match Room Loading Deadlock

The match rooms are currently failing to load (stuck on the loading spinner) because of a deadlock in the asynchronous data fetching logic. This occurs when multiple load requests overlap, causing some to return early without clearing the `loading` state, while others are "aborted" by component unmounting or re-rendering.

## Current State Analysis

- **Concurrency Guard**: `loadingRef` is used to prevent multiple simultaneous requests.
- **Lifecycle Guard**: A `mounted` flag (via closure) is used to prevent state updates on unmounted components.
- **Deadlock Scenario**:
    1. `loadData` (v1) starts, sets `loadingRef.current = true` and `loading = true`.
    2. Component re-renders or `useEffect` re-runs, setting the `mounted` flag for v1 to `false`.
    3. `loadData` (v2) starts, sees `loadingRef.current === true`, and returns immediately *before* entering the `try/finally` block.
    4. `loadData` (v1) finishes, but because its `mounted` flag is `false`, it skips `setLoading(false)`.
    5. Result: `loading` stays `true` forever, and the spinner never disappears.

## Proposed Changes

We will implement a robust loading pattern across all match-related components that ensures the loading state is always cleared when the component is mounted, while still preventing redundant state updates.

### 1. `src/pages/MatchRoomPage.tsx`
- Add a component-level `isMountedRef` to track the lifecycle independently of specific `useEffect` runs.
- Update `loadMatch` to:
    - Set `loadingRef.current = true` only after the initial check.
    - Use `isMountedRef.current` in the `finally` block to safely call `setLoading(false)`.
    - Ensure `setLoading(false)` is reachable even if parts of the function return early (by using a more robust `try/finally` structure).

### 2. `src/components/sports/CricketRoom.tsx`
- Apply the same `isMountedRef` pattern.
- Fix `loadInnings` and `loadRecentEvents` to ensure they don't leave the component in a permanent loading state.

### 3. `src/components/sports/GolfRoom.tsx`
- Apply the same `isMountedRef` pattern.
- Fix `loadData` and `initializeHoles`.

### 4. `src/components/sports/ChipOffRoom.tsx`
- Apply the same `isMountedRef` pattern.
- Fix `loadData`.

## Implementation Pattern (Template)

```typescript
const isMountedRef = useRef(true);
useEffect(() => {
  isMountedRef.current = true;
  return () => { isMountedRef.current = false; };
}, []);

const loadData = useCallback(async (isMounted?: () => boolean) => {
  if (loadingRef.current) return;
  
  try {
    loadingRef.current = true;
    setLoading(true);
    
    const data = await fetchData();
    
    // Check if THIS specific call is still valid for updating data
    if (isMounted && !isMounted()) return;
    setData(data);
  } catch (err) {
    console.error(err);
  } finally {
    loadingRef.current = false;
    // Check if the COMPONENT is still mounted to safely clear loading
    if (isMountedRef.current) {
      setLoading(false);
    }
  }
}, []);
```

## Verification Plan

1. **Initial Load**: Navigate to a match room (e.g., `/match/ABCD`) and verify the spinner disappears and data loads.
2. **Rapid Navigation**: Navigate between different match rooms quickly and verify no deadlocks occur.
3. **Real-time Updates**: Trigger a status change (Pause/Resume) and verify the UI refreshes and the spinner clears correctly.
4. **Sport Specifics**: Test Golf, Cricket, and Chip Off rooms specifically as they have custom loading logic.
