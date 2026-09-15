import { useEffect } from "react";
import { useLocation } from "wouter";
import { SITE_ORIGIN, SITE_ROUTES } from "@/site-routes";

/**
 * What the browser does for free on a normal page load, and what a
 * client-side router has to be told to do.
 *
 * The bug this fixes: clicking "Book a Demo" in the footer changed the URL to
 * /demo and rendered the page, but kept the scroll position — so the reader
 * was left 2,000px down, looking at the footer of the page they had just
 * arrived on. It reads exactly like the link is broken.
 *
 * The <head> half is the same class of problem: the prerendered HTML carries
 * the right title, description and canonical on first load, but nothing
 * updated them when wouter swapped the page underneath. So every page reached
 * by a click claimed to be whichever page the visitor landed on first — wrong
 * in the tab, wrong in a bookmark, and wrong in anything that reads the
 * canonical after JS runs.
 */
export function RouteEffects() {
  const [location] = useLocation();

  useEffect(() => {
    // Skip the very first render: on a prerendered page the browser is already
    // where it should be, and may legitimately be restoring a scroll position
    // or honouring a #fragment. Only *navigations* need resetting.
    if (isFirstRender) {
      isFirstRender = false;
      return;
    }

    if (!window.location.hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }

    const route = SITE_ROUTES.find((r) => r.path === location);
    if (!route) return;

    document.title = route.title;
    setMeta("name", "description", route.description);
    setMeta("property", "og:title", route.title);
    setMeta("property", "og:description", route.social);
    setMeta("property", "og:url", `${SITE_ORIGIN}${route.path === "/" ? "/" : route.path}`);
    setCanonical(`${SITE_ORIGIN}${route.path === "/" ? "/" : route.path}`);
  }, [location]);

  // Clicking a link to the page you are already on.
  //
  // wouter changes nothing, so the effect above never runs, and the click does
  // visibly nothing at all. That is most of the reported problem: /demo's own
  // footer carries a "Book a Demo" button, so a reader who scrolled to the
  // bottom of /demo and pressed it got no response whatsoever.
  //
  // One delegated listener rather than an onClick on every link — it cannot be
  // forgotten on the next link somebody adds.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Leave modified clicks alone: they open tabs and windows.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || anchor.getAttribute("target") === "_blank") return;

      const [path, hash] = href.split("#");
      if (path !== window.location.pathname || hash) return;

      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }

    // Capture, not bubble: wouter's Link calls preventDefault() on its own
    // handler, so by the time a bubbling listener ran the event was already
    // marked handled and there was no way to tell a same-path click from a
    // cancelled one.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}

// Module scope rather than a ref: the component mounts once for the life of
// the page, and this reads more plainly than a ref that exists only to hold a
// boolean nobody renders.
let isFirstRender = true;

function setMeta(keyAttr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${keyAttr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(keyAttr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}
