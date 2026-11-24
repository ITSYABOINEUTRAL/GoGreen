import React, { useEffect, useRef, useState } from 'react';

/**
 * Ticks a payment stream's accrued amount locally between server refreshes,
 * mirroring FlashSaleCountdown's local-ticking pattern. `accrued`/`asOf` are the
 * last known server/on-chain values; `rate` is the per-second accrual rate.
 */
export default function StreamAccrual({ accrued, asOf, rate }) {
  const baseRef = useRef({
    accrued: Number(accrued) || 0,
    asOf: asOf ? new Date(asOf).getTime() : Date.now(),
  });
  const [displayed, setDisplayed] = useState(baseRef.current.accrued);

  useEffect(() => {
    baseRef.current = {
      accrued: Number(accrued) || 0,
      asOf: asOf ? new Date(asOf).getTime() : Date.now(),
    };
    setDisplayed(baseRef.current.accrued);
  }, [accrued, asOf]);

  useEffect(() => {
    const numericRate = Number(rate);
    const accruing = Number.isFinite(numericRate) && numericRate > 0;
    if (!accruing) return;
    const timer = setInterval(() => {
      const elapsedSeconds = Math.max(0, (Date.now() - baseRef.current.asOf) / 1000);
      setDisplayed(baseRef.current.accrued + elapsedSeconds * numericRate);
    }, 1000);
    return () => clearInterval(timer);
  }, [rate]);

  return <span>{Number.isFinite(displayed) ? displayed.toFixed(4) : '0.0000'}</span>;
}
