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

    // A #fragment means the link asked for somewhere specific on the page, so
    // honour it instead of going to the top. The browser does this itself on a
    // full page load but not when a router swaps the page — and at this point
    // the target does not exist yet, because React has not painted the new
    // page. Hence scrollToFragment's retry rather than a bare querySelector.
    const hash = window.location.hash.slice(1);
    if (hash) {
      scrollToFragment(hash);
    } else {
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
      if (path !== window.location.pathname) return;

      // Same page. A fragment means "take me to that part of it" — which the
      // browser also declines to do when the URL is otherwise unchanged, so
      // "Book a Demo" from the foot of /demo has to be handled here too.
      if (hash) {
        e.preventDefault();
        scrollToFragment(hash);
        if (window.location.hash.slice(1) !== hash) {
          window.history.replaceState(null, "", `${path}#${hash}`);
        }
        return;
      }

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

/**
 * Scroll a #fragment into view, allowing for the page not being there yet.
 *
 * Scrolls as soon as the target exists, then corrects itself a few times while
 * the rest of the page lays out. Arriving from the foot of a taller page makes
 * that necessary: the browser clamps the inherited scroll position to the
 * shorter document, content renders underneath, and a position computed before
 * that has already stopped being true.
 *
 * setTimeout, NOT requestAnimationFrame. rAF does not fire in a background or
 * hidden tab, so an rAF retry loop simply stops — the first frame runs, finds
 * the element, and the callback that would have done the scrolling never
 * arrives. Measured exactly that: the trace ended after one entry and the page
 * never moved. Anyone opening a link in a background tab would have hit it too.
 */
function scrollToFragment(id: string, attemptsLeft = 10) {
  const target = document.getElementById(id);

  if (!target) {
    if (attemptsLeft <= 0) {
      // Nothing to scroll to. Better the top of the page than wherever the
      // previous page happened to be scrolled to.
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      return;
    }
    window.setTimeout(() => scrollToFragment(id, attemptsLeft - 1), 50);
    return;
  }

  // HEADER_OFFSET clears the fixed navbar, which would otherwise cover the
  // heading of whatever we just scrolled to.
  //
  // "instant", not "smooth": a smooth scroll requested in the same breath as a
  // navigation is silently dropped. Measured — the identical call lands with
  // "instant" and does nothing at all with "smooth". It is also what a browser
  // does for a #fragment on a normal page load.
  const scrollToTarget = () => {
    const top = Math.round(target.getBoundingClientRect().top + window.scrollY);
    window.scrollTo({ top: Math.max(0, top - HEADER_OFFSET), left: 0, behavior: "instant" as ScrollBehavior });
  };

  scrollToTarget();

  // Then correct for anything that lays out late — a font swapping in, an
  // image finally sizing itself. Cheap, bounded, and stops as soon as the
  // element holds still.
  let previous = Math.round(target.getBoundingClientRect().top);
  let corrections = 0;
  const settle = window.setInterval(() => {
    const now = Math.round(target.getBoundingClientRect().top);
    if (now !== previous) {
      previous = now;
      scrollToTarget();
    }
    if (++corrections >= 8) window.clearInterval(settle);
  }, 80);
}

/** Height of the fixed navbar (h-20), plus a little breathing room. */
const HEADER_OFFSET = 96;

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
