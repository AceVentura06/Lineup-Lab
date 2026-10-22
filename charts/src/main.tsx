import "./styles.css";
import type { ComponentType } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { WeekChart, type WeekChartProps } from "./islands/week-chart";

/*
 * Lineup Lab islands: index.html renders plain HTML as usual and marks spots like
 *   <div class="ll-island" data-island="week" data-props='{"weeks":[…]}'></div>
 * This module mounts a React chart into each spot, and keeps doing so as the page
 * re-renders. If this file never loads, the hand-built chart next to it stays visible.
 */
// biome-ignore lint: each island takes its own props, parsed from data-props
const ISLANDS: Record<string, ComponentType<any>> = {
  week: WeekChart as ComponentType<WeekChartProps>,
};

const roots = new Map<HTMLElement, Root>();

function mount(el: HTMLElement) {
  if (roots.has(el)) return;
  const Island = ISLANDS[el.dataset.island ?? ""];
  if (!Island) return;
  let props: unknown;
  try {
    props = JSON.parse(el.dataset.props ?? "{}");
  } catch {
    return;
  }
  const root = createRoot(el);
  roots.set(el, root);
  // render before the browser paints, so the hand-built fallback never flashes
  flushSync(() => root.render(<Island {...(props as object)} />));
}

function scan() {
  document.querySelectorAll<HTMLElement>(".ll-island[data-island]").forEach(mount);
  // free charts whose card was replaced by a re-render
  for (const [el, root] of roots) {
    if (!el.isConnected) {
      root.unmount();
      roots.delete(el);
    }
  }
}

// mutation callbacks run before paint, and one callback covers a whole re-render
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
scan();
