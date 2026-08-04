# Something is broken

Find the symptom. Each one lists the likely cause and the fix.

## First: where to look

Almost every server-side problem shows up here:

**Supabase dashboard → Edge Functions → `register` (or `hubtel-callback`) → Logs**

That is the single most useful page in this whole system. Check it before guessing.

---

## The form says "This form is not connected yet"

**Cause:** `functionUrl` in [`src/data/registration.json`](../src/data/registration.json) has
lost its real value, or the site was published without rebuilding.

**Fix:**

```bash
# 1. Check the value is right
grep functionUrl src/data/registration.json
# should read: https://eisqaarydwtsarlghdjs.supabase.co/functions/v1/register

# 2. Rebuild and republish
node build.js
```

---

## Every submission fails with "401"

**Cause:** the function was deployed without `--no-verify-jwt`. Supabase then demands a login
token, which a public form has no way to provide.

**Fix:**

```bash
npx supabase functions deploy register --no-verify-jwt
```

The flag is easy to forget. If registration breaks right after a deploy, check this first.

---

## Submissions fail in the browser but work from the command line

**Cause:** a browser security rule. The website's address doesn't match the `ALLOWED_ORIGIN`
setting on the server. Look for a "CORS" error in the browser console (F12).

**Fix:**

```bash
npx supabase secrets set ALLOWED_ORIGIN=https://missecoghana.com
npx supabase functions deploy register --no-verify-jwt
```

It must match the real site address exactly, including `https://`.

---

## No emails are arriving

Work through these in order.

**1. Is the key even set?**

```bash
npx supabase secrets list
```
Look for `RESEND_API_KEY`. If it's missing, that's your answer — the program logs
`RESEND_API_KEY unset` and carries on without sending. Applications are still saved.

**2. Is Resend refusing to deliver?**

Until a domain is verified, Resend only delivers to **the email address that owns the Resend
account.** If `NOTIFY_EMAIL` points anywhere else, the message is rejected.

```bash
npx supabase secrets set NOTIFY_EMAIL=the-address-that-owns-the-resend-account
npx supabase functions deploy register --no-verify-jwt
```

**3. Check spam.** First messages from a new sender often land there.

**4. Check the logs** for `resend rejected the send` — the reason will be printed next to it.

> **Important:** email failures never lose an application. The entry is already saved. Open
> the Supabase dashboard → Table Editor → `registrations` to see everything.

---

## The form says "Registration is closed" when it shouldn't

**Cause:** the dates. They live in **two files** and both matter.

**Fix:** check both and make sure they agree.

```bash
grep -A3 '"tiers"' src/data/registration.json
grep -A3 'TIERS' supabase/functions/_shared/config.ts
```

See [OPERATIONS.md](OPERATIONS.md) for how to change dates properly.

> Note: the server uses **UTC**, so around midnight the site and the server can briefly
> disagree by a few hours. This is expected and harmless.

---

## Someone paid but they still show as unpaid

**Cause:** the confirmation message from Hubtel never arrived. This is a known weakness — see
"Known limits" below.

**Fix (by hand):**

1. Open the Hubtel dashboard and confirm the money really arrived.
2. Note the payment reference.
3. Supabase → Table Editor → `registrations`, find the row by email.
4. Set `payment_status` to `paid`, fill in `paid_at` and `amount_paid_ghs`.

Check the `hubtel-callback` logs too — if the message was rejected, the reason is there.

---

## Someone can't register — "a registration already exists"

**If their previous entry was never paid,** this shouldn't happen; the system is built to
replace unpaid entries. Check the logs.

**If they genuinely paid already,** that's correct behaviour — one entry per person.

**To let them start over:** delete their row in Table Editor. They can then submit again.

---

## A photo won't upload

Only JPG, PNG, WEBP and HEIC are accepted, up to 10 MB. iPhone photos are usually HEIC and
are fine.

Bigger than 10 MB is rejected with a clear message. They should shrink it or send a different
photo. This limit is set in three places and all three must agree if you change it:
`registration.json`, the `register` function, and the storage bucket rule in
`supabase/migrations/0001_registrations.sql`.

---

## The website looks wrong after an edit

**Almost always:** the file was edited directly instead of rebuilt.

```bash
node build.js
```

If your change disappears after that, you edited `index.html` or `register.html` by hand.
Make the change in `src/` instead. See [README.md](README.md).

**If the styling is broken,** remember the CSS is *inlined* into the page. A normal browser
refresh can show you the old version — do a hard refresh (Ctrl+Shift+R).

---

## Known limits — things that behave this way on purpose

**Lost payment confirmations are not automatically recovered.**
Hubtel offers a "check this transaction" service, but it only accepts requests from a fixed,
pre-approved internet address, and Supabase functions don't have one. So it isn't used.

*Consequence:* if a confirmation message is lost, that person stays "unpaid" until someone
fixes it by hand. At the number of applicants expected, this should be rare — but it will not
fix itself, so it's worth checking the unpaid list against Hubtel now and then.

**Hubtel messages are not signed.**
There's no mathematical proof a message came from Hubtel. Protection comes from the sender's
internet address plus the 32-character random code. This is Hubtel's own recommended approach.

**Never set `ALLOW_ANY_CALLBACK_IP`.**
It's a testing switch that turns off the sender check. With it on, anyone on the internet
could mark registrations as paid.

---

## Emergency: how to stop registrations immediately

Change the dates in **both** places so today falls outside them, then rebuild and redeploy:

```bash
# edit src/data/registration.json and supabase/functions/_shared/config.ts
node build.js
npx supabase functions deploy register --no-verify-jwt
```

The server refuses submissions on its own clock, so redeploying the function is the part that
actually stops them — the website change only updates what people see.
