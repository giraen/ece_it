"use client";

import { useEffect, useState } from "react";

interface Info {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

async function read(): Promise<Info> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  const persisted = s?.persisted ? await s.persisted() : null;
  const est = s?.estimate ? await s.estimate() : undefined;
  return { persisted, usage: est?.usage ?? null, quota: est?.quota ?? null };
}

/** Whether the browser has agreed to keep this site's data, and how much space it uses. */
export default function StorageStatus() {
  const [info, setInfo] = useState<Info | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    let alive = true;
    void read().then((i) => {
      if (alive) setInfo(i);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function ask() {
    setAsked(true);
    await navigator.storage?.persist?.();
    setInfo(await read());
  }

  return (
    <section className="space-y-3 rounded-md border border-line bg-surface p-5" aria-label="Storage">
      <h2 className="font-medium">Storage</h2>
      {info === null ? (
        <p className="text-sm text-muted">Checking…</p>
      ) : (
        <>
          {info.persisted === true && (
            <p className="text-sm text-good">
              Protected. Your browser has agreed not to delete this data when it runs low on space.
            </p>
          )}
          {info.persisted === false && (
            <p className="text-sm text-danger">
              Not protected. Your browser may clear this site&apos;s data when it runs low on space. A regular backup
              is your safety net.
            </p>
          )}
          {info.persisted === null && (
            <p className="text-sm text-muted">This browser cannot say whether your data is protected.</p>
          )}
          {info.usage !== null && info.quota !== null && (
            <p className="text-sm text-muted">
              Using {size(info.usage)} of about {size(info.quota)} available.
            </p>
          )}
          {info.persisted === false && (
            <div>
              <button className="btn" onClick={() => void ask()}>
                Ask the browser to protect it
              </button>
              {asked && info.persisted === false && (
                <p className="mt-1 text-xs text-muted">
                  The browser said no for now. It often says yes once you use the site regularly or install it.
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-muted">
            Clearing your browsing data or site data deletes your questions, even when protected. Back up first.
          </p>
        </>
      )}
    </section>
  );
}