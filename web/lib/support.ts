// Who customers contact, and whether "Restore Purchase" can email them a link.
// Restore-by-email needs a sender that can email customers (Supabase's default one only reaches the project team), so
// it's off until custom SMTP is set up (owner, 2026-10-12). Meanwhile lost access means emailing the owner, who can
// look the payment up in Stripe. To switch it back on: set NEXT_PUBLIC_RESTORE_BY_EMAIL=true in Vercel and redeploy.
export const SUPPORT_EMAIL = "emre.kapanci@gmail.com";   // public on the site (owner's choice, 2026-10-11)
export const RESTORE_BY_EMAIL = process.env.NEXT_PUBLIC_RESTORE_BY_EMAIL === "true";
