/** Where a question or note came from. Web addresses in the text become links. */
const URL_PART = /(https?:\/\/[^\s<>"')]+)/g;

export default function Reference({ text, className = "" }: { text?: string; className?: string }) {
  const value = text?.trim();
  if (!value) return null;
  const parts = value.split(URL_PART);
  return (
    <p className={`text-xs text-muted ${className}`}>
      <span className="font-medium">Source:</span>{" "}
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}