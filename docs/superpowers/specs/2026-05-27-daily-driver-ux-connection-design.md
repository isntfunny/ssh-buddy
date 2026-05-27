# Daily Driver UX - Workspace, Organization & Connection Design

**Date:** 2026-05-27
**Status:** Approved (Expanded)
**Author:** Gemini CLI

## 1. Overview
The "Daily Driver UX" phase transforms `ssh-buddy` from a single-session client into a multi-session power tool. It introduces an IDE-style workspace with tiling/tabs, advanced profile organization via tags, and visual customization.

## 2. Goals
- **Multi-Session:** Support multiple concurrent SSH sessions in a flexible tabbed/grid layout.
- **Organization:** Replace simple lists with tag-based "Smart Folders" and context menus.
- **Visual Clarity:** Use profile colors to distinguish sessions and indicate connection health.
- **Ergonomics:** Auto-focus terminals, clarify error messages, and provide a non-intrusive security bar for web users.

## 3. UI/UX Design

### 3.1 IDE Workspace (Tiling & Tabs)
- **Library:** Use `react-mosaic` for managing the tiled window manager (grid).
- **Grid Layout:** Support up to a 2x2 grid (4 panes) on desktop/web; simplified single-pane on mobile.
- **Drag & Drop:** 
  - Drag tabs to edges to split a pane (top/bottom/left/right).
  - Drag tabs to center to merge into a tab group.
  - **Hard Constraint:** No window "popouts"; sessions stay within the app container.
- **Tab Management:**
  - Double-click to rename a session (temporary override of profile name).
  - Tab border/accent color matches the profile's chosen color.

### 3.2 Sidebar Organization (Smart Folders)
- **Tag-based Grouping:** Profiles are grouped by tags. A profile with multiple tags appears in each corresponding "Smart Folder".
- **Sections:**
  - `Untagged`: For profiles without tags.
  - `All`: Flat list of all profiles (optional toggle).
- **Context Menus:**
  - **Tags:** Right-click to Rename Tag (updates all associated profiles) or Delete Tag.
  - **Profiles:** Right-click to Duplicate, Connect in New Tab, Edit, or Delete.

### 3.3 Visual Customization (Profile Colors)
- **Schema Extension:** Add `color` (string, hex/mantine color) to the `Profile` type.
- **Application:**
  - Sidebar: Small colored dot or bar next to the profile name.
  - Tabs: Underline or accent in the profile color when active.
  - Connection Header: Status dot (Teal/Red/etc.) complemented by the profile's identity color.

### 3.4 Connection Workflow & Errors
- **Connection Header (Minimalist):** Compact layout showing name, `user@host:port`, and a status dot.
- **Terminal Auto-focus:** Keyboard focus is moved to the terminal **only after** a successful SSH handshake.
- **Error Display:** 
  - Subtle warning icon (⚠️) in the sidebar for the last failed attempt.
  - Human-readable error mapping (e.g., "Connection Refused" instead of "ECONNREFUSED").
- **Browser Proxy Warning:** A dismissible alert bar stored in `localStorage`.

## 4. Technical Architecture

### 4.1 Data Schema Updates
```typescript
type Profile = {
  // ... existing fields
  color?: string;       // Hex or Mantine color name
  tags: string[];      // Existing, but used for grouping
}
```

### 4.2 Workspace State
- Introduce a `WorkspaceProvider` or similar to track the `MosaicNode` tree and the map of active `SessionID -> SshSession` instances.
- Maintain a list of "Open Tabs" separate from the "Profile List".

### 4.3 Testing Strategy
- **Unit Tests:** `react-mosaic` state transitions, error mapping utilities.
- **Component Tests:** Sidebar tag-grouping logic, `ProxyWarning` persistence.
- **E2E:** Opening multiple sessions and verifying they don't leak input/output between panes.

## 5. Security
- Web proxy warning is mandatory and dismissible only per-device.
- Master password remains the E2E encryption key for all profile metadata, including new `color` and `tags` fields.
