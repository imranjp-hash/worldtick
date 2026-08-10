import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getSiteUrl } from "../config/site";
import { resolveRouteMetadata } from "../utils/routeMetadata";

function findOrCreateMeta(selector, attributes) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("meta");
    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
    document.head.appendChild(element);
  }

  return element;
}

function setMetaContent(selector, attributes, content) {
  findOrCreateMeta(selector, attributes).setAttribute("content", content);
}

function findOrCreateCanonical() {
  let canonical = document.head.querySelector('link[rel="canonical"]');

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }

  return canonical;
}

export default function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const metadata = resolveRouteMetadata(pathname);
    const canonicalUrl = getSiteUrl(metadata.canonicalPath);
    const robots = metadata.robots ?? "index, follow";

    document.title = metadata.title;
    findOrCreateCanonical().setAttribute("href", canonicalUrl);
    setMetaContent('meta[name="description"]', { name: "description" }, metadata.description);
    setMetaContent('meta[name="robots"]', { name: "robots" }, robots);
    setMetaContent('meta[property="og:url"]', { property: "og:url" }, canonicalUrl);
    setMetaContent('meta[property="og:title"]', { property: "og:title" }, metadata.title);
    setMetaContent(
      'meta[property="og:description"]',
      { property: "og:description" },
      metadata.description,
    );
    setMetaContent('meta[name="twitter:title"]', { name: "twitter:title" }, metadata.title);
    setMetaContent(
      'meta[name="twitter:description"]',
      { name: "twitter:description" },
      metadata.description,
    );
  }, [pathname]);

  return null;
}
