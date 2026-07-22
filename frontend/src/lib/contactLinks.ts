export function waLink(phone: string, message: string) {
  let clean = (phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  // Numbers are entered as plain 10-digit local numbers (e.g. 9876543210).
  // wa.me requires the full international number, so assume India (+91)
  // when we see a bare 10-digit number with no country code already.
  if (/^\d{10}$/.test(clean)) clean = `91${clean}`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function smsLink(phone: string, message: string) {
  const clean = (phone || "").replace(/[^\d+]/g, "");
  return `sms:${clean}?body=${encodeURIComponent(message)}`;
}
