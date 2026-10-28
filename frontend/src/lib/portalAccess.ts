/**
 * Where customers go, and the exact message the owner sends with a PIN.
 * Customers use the public portal (browse the shop, enquire, ledger, advance bookings),
 * so every "share PIN" button builds its WhatsApp message here. If the portal ever moves,
 * set VITE_PORTAL_URL instead of editing messages in several places.
 */
export const PORTAL_URL = ((import.meta.env?.VITE_PORTAL_URL as string | undefined) || "https://portal-sbt.web.app").replace(/\/$/, "");

export function portalAccessMessage(customerName: string, pin: string, lang: "en" | "hi" = "en"): string {
  if (lang === "hi") {
    const namaste = customerName ? `नमस्ते ${customerName} जी` : "नमस्ते";
    return `${namaste}, आप हमारा सामान देख सकते हैं, पूछताछ भेज सकते हैं और अपना खाता व बुकिंग की जानकारी कभी भी यहाँ देख सकते हैं: ${PORTAL_URL}\nलॉग इन के लिए अपना मोबाइल नंबर और यह PIN डालें: ${pin}`;
  }
  const hi = customerName ? `Hi ${customerName}` : "Hi";
  return `${hi}, you can browse our shop, send enquiries and see your account ledger and bookings with us anytime here: ${PORTAL_URL}\nLog in with your phone number and this PIN: ${pin}`;
}
