// Phone-number accounts. Sign-in uses a hidden internal email derived from the phone number.

/** Normalize a Tanzanian mobile number to 255XXXXXXXXX, or null if invalid. */
export function normalizeTzPhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("255")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^[67]\d{8}$/.test(d)) return null;
  return `255${d}`;
}

export function phoneToAuthEmail(normalized: string): string {
  return `${normalized}@phone.omuh360.app`;
}

export function formatPhone(normalized: string): string {
  const d = normalized.replace(/^255/, "");
  return `+255 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
