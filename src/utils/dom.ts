// ===================================================================
// dom.ts — Lightweight declarative DOM helper
//
// Provides a concise API for creating and updating DOM elements
// without any framework dependency. Inspired by hyperscript.
//
// NOTE: The `safeHTML` attribute pipes its value through DOMPurify
// before assigning to `el.innerHTML`, so callers do not need to
// sanitize manually. Raw `innerHTML` is intentionally NOT exposed
// to prevent accidental XSS.
// ===================================================================

import DOMPurify from "dompurify";

export type Child = Node | string | number | null | undefined | false;
export type Children = Child | Child[];

export interface Attrs {
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  on?: Record<string, EventListener>;
  ref?: (el: HTMLElement) => void;
  /**
   * Sets `el.innerHTML` after sanitizing through DOMPurify.
   *
   * Use this instead of raw `innerHTML` to prevent XSS when the
   * content originates from user input, library output (KaTeX, etc.),
   * or any other potentially-untrusted source.
   */
  safeHTML?: string;
  [key: string]: unknown;
}

/**
 * Create an HTML element with attributes and children.
 *
 * @example
 * ```ts
 * const card = h("div", { class: "card" },
 *   h("h1", {}, "Title"),
 *   h("p", { class: "text-muted" }, "Body text"),
 * );
 * ```
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Children[]
): HTMLElementTagNameMap[K];
export function h(
  tag: string,
  attrs?: Attrs | null,
  ...children: Children[]
): HTMLElement;
export function h(
  tag: string,
  attrs?: Attrs | null,
  ...children: Children[]
): HTMLElement {
  const el = document.createElement(tag);

  if (attrs) {
    applyAttrs(el, attrs);
  }

  appendChildren(el, children);

  return el;
}

/**
 * Apply attributes to an existing element. Returns the element for chaining.
 */
export function applyAttrs<T extends HTMLElement>(el: T, attrs: Attrs): T {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;

    switch (key) {
      case "class":
        if (typeof value === "string" && value) {
          el.className = value;
        }
        break;

      case "style":
        if (typeof value === "string") {
          el.style.cssText = value;
        } else if (typeof value === "object") {
          Object.assign(el.style, value);
        }
        break;

      case "dataset":
        if (typeof value === "object") {
          for (const [dk, dv] of Object.entries(
            value as Record<string, string>,
          )) {
            el.dataset[dk] = dv;
          }
        }
        break;

      case "on":
        if (typeof value === "object") {
          for (const [event, handler] of Object.entries(
            value as Record<string, EventListener>,
          )) {
            el.addEventListener(event, handler);
          }
        }
        break;

      case "ref":
        if (typeof value === "function") {
          (value as (el: HTMLElement) => void)(el);
        }
        break;

      case "safeHTML":
        // Always sanitize before assigning to innerHTML to prevent XSS.
        el.innerHTML = DOMPurify.sanitize(value as string);
        break;

      default:
        // Boolean attributes
        if (typeof value === "boolean") {
          if (value) {
            el.setAttribute(key, "");
          } else {
            el.removeAttribute(key);
          }
        } else {
          el.setAttribute(key, String(value));
        }
        break;
    }
  }

  return el;
}

/**
 * Append one or more children (nodes, strings, numbers) to an element.
 * Falsy values (null, undefined, false) are skipped.
 */
export function appendChildren(
  parent: HTMLElement,
  children: Children[],
): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;

    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

/**
 * Clear all children from an element.
 */
export function clearElement(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Replace all children of an element with new content.
 */
export function replaceChildren(
  el: HTMLElement,
  ...children: Children[]
): void {
  clearElement(el);
  appendChildren(el, children);
}

/**
 * Show / hide an element via `display`.
 */
export function setVisible(el: HTMLElement, visible: boolean): void {
  el.style.display = visible ? "" : "none";
}

/**
 * Toggle a CSS class on an element.
 */
export function toggleClass(
  el: HTMLElement,
  className: string,
  force?: boolean,
): void {
  el.classList.toggle(className, force);
}

/**
 * Query selector with type assertion. Returns `null` when not found.
 */
export function qs<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(selector);
}

/**
 * Query selector all with type assertion.
 */
export function qsa<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * Shorthand to add an event listener and return a removal function.
 */
export function on<K extends keyof HTMLElementEventMap>(
  el: HTMLElement | Window | Document,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  el.addEventListener(event, handler as EventListener, options);
  return () => el.removeEventListener(event, handler as EventListener, options);
}

/**
 * Sanitize an HTML string via DOMPurify and assign it to `el.innerHTML`.
 *
 * Use this for any imperative innerHTML assignment instead of writing
 * `el.innerHTML = …` directly, so that every path goes through
 * DOMPurify and static-analysis tools won't flag a raw innerHTML sink.
 */
export function setSafeHTML(el: HTMLElement, html: string): void {
  el.innerHTML = DOMPurify.sanitize(html);
}

/**
 * Create a text node.
 */
export function text(content: string | number): Text {
  return document.createTextNode(String(content));
}

/**
 * Simple fade-in transition helper. Adds opacity transition then sets opacity to 1.
 */
export function fadeIn(el: HTMLElement, durationMs: number = 200): void {
  el.style.opacity = "0";
  el.style.transition = `opacity ${durationMs}ms ease`;
  // Force reflow
  void el.offsetHeight;
  el.style.opacity = "1";
}

/**
 * Simple fade-out transition helper. Returns a promise that resolves when done.
 */
export function fadeOut(
  el: HTMLElement,
  durationMs: number = 200,
): Promise<void> {
  return new Promise((resolve) => {
    el.style.transition = `opacity ${durationMs}ms ease`;
    el.style.opacity = "0";
    setTimeout(() => {
      resolve();
    }, durationMs);
  });
}
