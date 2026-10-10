"use client";
import { useEffect } from "react";

/** Registers the service worker in production only, so dev hot-reload never serves stale files. */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
