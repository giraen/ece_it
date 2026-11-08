import { EXPIRING_DAYS, type ExpiryMark } from "@/lib/progress/dashboard";

/** One round "!" badge. It shows a number when more than one row is behind it. */
export function Badge({ tone, total, text }: { tone: "expired" | "soon"; total: number; text: string }) {
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={`mr-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] leading-none font-bold ${
        tone === "expired" ? "bg-danger text-paper" : "bg-priority-solid text-on-priority"
      }`}
    >
      {total > 1 ? `! ${total}` : "!"}
    </span>
  );
}

/** A red ! when something here has expired, and an amber ! when something runs out soon. Both can show at once. */
export function ExpiryWarn({ mark }: { mark: ExpiryMark }) {
  const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;
  const expiredText = [
    mark.expiredSelf ? "This has expired." : "",
    mark.expiredInside > 0
      ? `${items(mark.expiredInside)} inside ${mark.expiredInside === 1 ? "has" : "have"} expired.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const soonText = [
    mark.soonSelf ? `This runs out within ${EXPIRING_DAYS} days.` : "",
    mark.soonInside > 0
      ? `${items(mark.soonInside)} inside run${mark.soonInside === 1 ? "s" : ""} out within ${EXPIRING_DAYS} days.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      {expiredText && (
        <Badge tone="expired" total={(mark.expiredSelf ? 1 : 0) + mark.expiredInside} text={expiredText} />
      )}
      {soonText && <Badge tone="soon" total={(mark.soonSelf ? 1 : 0) + mark.soonInside} text={soonText} />}
    </>
  );
}

/** "3 expired · 2 running out within 3 days", shown only when there is something to say. */
export function ExpirySummary({ expired, soon }: { expired: number; soon: number }) {
  if (expired === 0 && soon === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
      {expired > 0 && (
        <span>
          <Badge tone="expired" total={1} text="Expired" />
          {expired} expired
        </span>
      )}
      {soon > 0 && (
        <span>
          <Badge tone="soon" total={1} text={`Runs out within ${EXPIRING_DAYS} days`} />
          {soon} running out within {EXPIRING_DAYS} days
        </span>
      )}
    </p>
  );
}