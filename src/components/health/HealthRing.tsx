import type { CSSProperties } from "react";
import styles from "./health.module.css";

// The score as a ring, always with its number and "of 100" in words beside the colour.
export function HealthRing({ score, size = 56 }: { score: number; size?: number }) {
  const big = size >= 80;
  const thickness = big ? 8 : 5;
  return (
    <span className={styles.ring} style={{ width: size, height: size, "--score": score } as CSSProperties} aria-hidden="true">
      <span className={styles.ringInner} style={{ width: size - thickness * 2, height: size - thickness * 2 }}>
        <span className={styles.ringScore} style={{ fontSize: big ? 32 : 20 }}>{score}</span>
        {big ? <span className={styles.ringOf}>of 100</span> : null}
      </span>
    </span>
  );
}
