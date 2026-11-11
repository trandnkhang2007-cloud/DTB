# RE.UNIQLO Smart Repair Assistant (independent demo prototype)
Zero-dependency Node 18+ app. AI recommends, staff confirm, customer gets an email.
Run: `cp .env.example .env`, set STAFF_EMAIL (your email) and STAFF_PASSCODE, then `node server.js` -> http://localhost:3000 (customer), /staff.html (staff).
Test: with the server running as `STAFF_EMAIL=test@example.com node server.js`, run `node test.js`.
## Live mode
- AI: `AI_MODE=live`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (a vision-capable Claude model). Images go to the API as base64 from the server only.
- Email: `EMAIL_MODE=live`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (sender/domain verified in Resend; a recipient alone is not enough, and Resend test senders only deliver to your own account email).
- Set `NEXT_PUBLIC_APP_URL` to your public URL so email links work. Pricing: edit data/pricing.json (same shape as defaults in server.js).
## Not built yet (see final report): Supabase/Next.js/Tailwind stack, real damage reference photos, Supabase magic-link auth.

## Deploy (Render, free, demo only)
Push to GitHub, then Render > New > Blueprint. Set STAFF_EMAIL and STAFF_PASSCODE only. The public URL is detected automatically. Free plan sleeps after ~15 min idle and loses data on restart: fine for a demo.
