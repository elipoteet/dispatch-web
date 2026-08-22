// Student vs. alumni is derived here, at read time, from grad_year — no
// stored role column anywhere (see docs/phase-one.md's "profiles" table).
export function isAlumni(gradYear: number, now: Date = new Date()): boolean {
  return gradYear < now.getFullYear();
}

// "✓ UNH '27", with " ALUM" appended once grad_year is in the past.
export function formatBadge(shortName: string, gradYear: number, now: Date = new Date()): string {
  const yearSuffix = String(gradYear).slice(-2);
  const alum = isAlumni(gradYear, now);
  return `✓ ${shortName} '${yearSuffix}${alum ? " ALUM" : ""}`;
}
