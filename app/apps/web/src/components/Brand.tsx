/* eslint-disable @next/next/no-img-element */

// Local copy: ui.tsx is a client module, and this file is also used by server pages.
const cx = (...c: (string | undefined)[]) => c.filter(Boolean).join(" ");

/** The City of Navotas seal, on a white disc so it reads on dark headers. */
export function Seal({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-white p-[2px] shadow-sm ring-1 ring-seal-gold/70", className)} style={{ width: size, height: size }}>
      <img src={size > 96 ? "/brand/navotas-seal.webp" : "/brand/navotas-seal-192.webp"} alt="City of Navotas seal" width={size} height={size} className="h-full w-full object-contain" />
    </span>
  );
}

export function SealStripe({ className }: { className?: string }) {
  return <div aria-hidden className={cx("seal-stripe", className)} />;
}
