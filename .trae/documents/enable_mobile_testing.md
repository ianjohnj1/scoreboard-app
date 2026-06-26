# Plan: Enable Mobile Testing on Local Network

## Summary
To allow testing the scoreboard app on a mobile device, we need to expose the Vite development server to the local network. This involves running the server with the `--host` flag and accessing it via the computer's local IP address.

## Current State Analysis
- Local IP Address: `192.168.1.117`
- Current Dev Script: `"dev": "vite"` (localhost only)
- Default Port: `5173`

## Proposed Changes

### 1. Update package.json
- Add a new script `"dev:host"` to [package.json](file:///c:/Users/User/Desktop/scoreboard%20app/project/package.json) that runs `vite --host`. This keeps the standard `dev` script unchanged while providing a clear pathway for network testing.

### 2. Provide Mobile Access Instructions
- Instruct the user to run `npm run dev:host`.
- Provide the exact URL for the mobile device: `http://192.168.1.117:5173`.
- Note: Both the computer and the mobile device must be on the same Wi-Fi network.

## Assumptions & Decisions
- **Decision**: Creating a separate script (`dev:host`) is preferred over modifying the existing `dev` script to maintain standard local development behavior.
- **Assumption**: The firewall on the computer allows incoming connections on port `5173`. If not, the user may need to manually allow it.

## Verification Steps
1. Run `npm run dev:host` in the terminal.
2. Verify that the terminal output shows "Network: http://192.168.1.117:5173/".
3. Open the URL on a mobile device connected to the same network.
