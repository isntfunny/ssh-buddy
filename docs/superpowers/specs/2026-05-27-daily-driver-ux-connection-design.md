# Daily Driver UX - Connection Workflow Polish Design

**Date:** 2026-05-27
**Status:** Approved
**Author:** Gemini CLI

## 1. Overview
The "Daily Driver UX" phase aims to make `ssh-buddy` feel robust and intuitive for regular use. This first sub-task focuses on polishing the SSH connection workflow, refining the UI feedback, and improving ergonomics (terminal focus).

## 2. Goals
- Streamline the `ConnectionView` header for clarity and density.
- Improve terminal ergonomics by auto-focusing on connection.
- Surface connection failures in the sidebar for better visibility of "broken" profiles.
- Inform browser users about the proxy security tradeoff in a non-intrusive way.
- Map cryptic SSH errors to human-readable explanations.

## 3. UI/UX Design

### 3.1 Connection Header (Concept A: Minimalist Dot)
- **Status Indicator:** A simple colored dot (Teal = Connected, Yellow = Connecting, Red = Error, Gray = Disconnected).
- **Profile Info:** Displays profile name and `user@host:port` in a compact layout.
- **Actions:** 
  - `Disconnect` button appears only when connected.
  - `Connect` / `Reconnect` button appears when disconnected or after an error.
  - `Clear` action (broom icon or text) to wipe terminal buffer.

### 3.2 Terminal Interaction
- **Auto-focus:** The terminal will automatically receive keyboard focus **only after** a successful SSH connection is established. This prevents accidental typing while the connection is still being negotiated.

### 3.3 Profile List Error Indicators (Option 1: Subtle Icon)
- Profiles that encountered an error during the last connection attempt will show a small warning icon (⚠️) next to their name in the sidebar.
- The detailed error text will be available in the `ConnectionView` if that profile is selected.

### 3.4 Browser Proxy Warning
- Instead of a permanent text block, show a dismissible `Alert` bar below the header.
- "Browser SSH routes through your configured WebSocket proxy. The proxy can observe credentials during handshake."
- Persistence: Store the dismissal state in `localStorage` so it only appears once per browser/user.

## 4. Technical Implementation

### 4.1 Error Mapping
- Create a dedicated utility `src/modules/ssh/errors.ts` to map internal error strings (from `russh` or Go proxy) to friendly UI messages.
- New categories: `timeout`, `host_unreachable`, `auth_failed`.

### 4.2 State Management
- Update `ConnectionView` to track the "dismissed" state of the proxy warning.
- Use `useEffect` in `ConnectionView` to trigger `term.focus()` when `session.state === 'connected'`.

### 4.3 Testing
- **Unit Tests:** Verify `friendlyError` mapping.
- **Component Tests:** Verify `ProxyWarning` dismissal and persistence.
- **Integration:** Ensure the sidebar correctly renders the error icon based on the profile's `lastErrorCategory`.

## 5. Security Considerations
- The proxy warning remains a hard requirement for the web build to ensure transparency about credential visibility.
- Error mapping must not leak sensitive session details.
