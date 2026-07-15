// Brazilian phone normalization to E.164 (+55...)

export function normalizePhoneBR(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  // Strip leading 0
  let d = digits.replace(/^0+/, "");
  // If already includes country code
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    return `+${d}`;
  }
  // 10 (landline) or 11 (mobile) digits — prepend country
  if (d.length === 10 || d.length === 11) {
    return `+55${d}`;
  }
  return null;
}

export function formatPhoneBR(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return e164;
}
