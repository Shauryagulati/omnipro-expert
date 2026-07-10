export interface DutyPoint {
  amps: number;
  dutyPct: number;
}

// Linear interpolation between documented points; clamped at the ends.
// Below the lowest documented amps the machine runs continuously (100%).
export function dutyAt(points: DutyPoint[], amps: number): number {
  const sorted = [...points].sort((a, b) => a.amps - b.amps);
  if (amps <= sorted[0].amps) return Math.max(...sorted.map((p) => p.dutyPct));
  const last = sorted[sorted.length - 1];
  if (amps >= last.amps) return last.dutyPct;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (amps >= a.amps && amps <= b.amps) {
      const t = (amps - a.amps) / (b.amps - a.amps);
      return Math.round(a.dutyPct + t * (b.dutyPct - a.dutyPct));
    }
  }
  return last.dutyPct;
}

export function isDocumented(points: DutyPoint[], amps: number): boolean {
  return points.some((p) => p.amps === amps);
}

export function weldRestMinutes(dutyPct: number): { weld: number; rest: number } {
  const weld = Math.round(dutyPct) / 10;
  return { weld, rest: Math.round((10 - weld) * 10) / 10 };
}
