"use client";

import { useState } from "react";
import ReactMarkdown, { defaultUrlTransform, type Options } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useImageUrl } from "@/lib/hooks";

const remarkPlugins: Options["remarkPlugins"] = [remarkMath];
const rehypePlugins: Options["rehypePlugins"] = [[rehypeKatex, { throwOnError: false, strict: "ignore" }]];

function urlTransform(url: string): string {
  // Images saved in the bank are referenced as img:<id>.
  return url.startsWith("img:") ? url : defaultUrlTransform(url);
}

function StoredImage({ src, alt }: { src: string; alt: string }) {
  const id = src.startsWith("img:") ? src.slice(4) : null;
  const url = useImageUrl(id);
  const [zoomed, setZoomed] = useState(false);

  if (!id) return null;
  if (!url) {
    return <span className="text-sm text-muted">[image not found]</span>;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- blob URLs cannot go through next/image */}
      <img
        src={url}
        alt={alt}
        onClick={(e) => {
          e.stopPropagation();
          setZoomed(true);
        }}
        className="inline-block max-h-72 max-w-full cursor-zoom-in rounded border border-line bg-white align-middle"
      />
      {zoomed && (
        <span
          role="dialog"
          aria-label="Enlarged image"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(false);
          }}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/70 p-8"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- blob URLs cannot go through next/image */}
          <img src={url} alt={alt} className="max-h-full max-w-full rounded bg-white" />
        </span>
      )}
    </>
  );
}

function MarkdownImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  return <StoredImage src={typeof src === "string" ? src : ""} alt={alt ?? ""} />;
}

const components: Options["components"] = { img: MarkdownImage };

// A picture saved in the bank is written as ![alt](img:id).
const IMAGE = /!\[([^\]]*)\]\(img:([0-9a-f]+)\)/g;

/**
 * Markdown with LaTeX ($...$ and $$...$$) and bank images (![](img:id)).
 * Pictures are always shown under the text, wherever they were placed in the box.
 */
export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const pictures = Array.from(text.matchAll(IMAGE), (m) => ({ alt: m[1], id: m[2] }));
  const body = text.replace(IMAGE, "").trim();

  return (
    <div className={`rich ${className}`}>
      {body && (
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          urlTransform={urlTransform}
          components={components}
        >
          {body}
        </ReactMarkdown>
      )}
      {pictures.length > 0 && (
        <div className={`flex flex-wrap items-start gap-3 ${body ? "mt-3" : ""}`}>
          {pictures.map((p, i) => (
            <StoredImage key={`${p.id}-${i}`} src={`img:${p.id}`} alt={p.alt} />
          ))}
        </div>
      )}
    </div>
  );
}