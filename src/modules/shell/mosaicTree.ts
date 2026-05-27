import type { MosaicNode } from 'react-mosaic-component';

/**
 * Helpers for the react-mosaic n-ary tree where every leaf is a session id.
 * We own the tree (controlled `value`/`onChange`), so these transforms are
 * plain immutable functions over the node shape.
 */

export function collectLeaves(node: MosaicNode<string> | null): string[] {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  if (node.type === 'tabs') return [...node.tabs];
  return node.children.flatMap(collectLeaves);
}

/** True when the session sits inside a tabs group (so a native tab bar renders for it). */
export function isInTabsNode(node: MosaicNode<string> | null, id: string): boolean {
  if (node == null || typeof node === 'string') return false;
  if (node.type === 'tabs') return node.tabs.includes(id);
  return node.children.some((child) => isInTabsNode(child, id));
}

/** Returns all tab ids of the tabs group containing `id`, or null when `id` is standalone. */
export function getGroupTabs(node: MosaicNode<string> | null, id: string): string[] | null {
  if (node == null || typeof node === 'string') return null;
  if (node.type === 'tabs') return node.tabs.includes(id) ? node.tabs : null;
  for (const child of node.children) {
    const found = getGroupTabs(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Insert `newId` next to `activeId`:
 * - empty tree -> the new id becomes the single leaf
 * - active leaf standalone -> wrap both in a 2-tab group
 * - active leaf already in a tabs group -> append and focus the new tab
 * Falls back to the first leaf when `activeId` is missing.
 */
export function insertSession(
  tree: MosaicNode<string> | null,
  activeId: string | null,
  newId: string,
): MosaicNode<string> {
  if (tree == null) return newId;

  const leaves = collectLeaves(tree);
  const target = activeId && leaves.includes(activeId) ? activeId : leaves[0];
  if (!target) return newId;

  const transform = (node: MosaicNode<string>): MosaicNode<string> | null => {
    if (typeof node === 'string') {
      if (node !== target) return null;
      return { type: 'tabs', tabs: [node, newId], activeTabIndex: 1 };
    }
    if (node.type === 'tabs') {
      if (!node.tabs.includes(target)) return null;
      return { ...node, tabs: [...node.tabs, newId], activeTabIndex: node.tabs.length };
    }
    for (let i = 0; i < node.children.length; i++) {
      const replaced = transform(node.children[i]);
      if (replaced) {
        const children = [...node.children];
        children[i] = replaced;
        return { ...node, children };
      }
    }
    return null;
  };

  return transform(tree) ?? tree;
}

/** Remove a leaf and collapse any tabs group / split left with a single child. */
export function removeLeaf(
  node: MosaicNode<string> | null,
  id: string,
): MosaicNode<string> | null {
  if (node == null) return null;
  if (typeof node === 'string') return node === id ? null : node;

  if (node.type === 'tabs') {
    const tabs = node.tabs.filter((t) => t !== id);
    if (tabs.length === 0) return null;
    if (tabs.length === 1) return tabs[0];
    return { ...node, tabs, activeTabIndex: Math.min(node.activeTabIndex, tabs.length - 1) };
  }

  const children = node.children
    .map((child) => removeLeaf(child, id))
    .filter((child): child is MosaicNode<string> => child !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  const splitPercentages =
    node.splitPercentages && node.splitPercentages.length === children.length
      ? node.splitPercentages
      : undefined;
  return { ...node, children, splitPercentages };
}
