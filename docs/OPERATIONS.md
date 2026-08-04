# Making changes

Everyday tasks, each one start to finish.

**Remember:** edit files in `src/`, never `index.html` or `register.html`. Then run
`node build.js`.

---

## Change a fee or a registration date

⚠️ **This lives in two files. Change both or the site will advertise a price the server
refuses to take.**

**1. What the page shows** — [`src/data/registration.json`](../src/data/registration.json)

```json
{ "id": "early", "label": "Early Bird", "ghs": 200, "usd": 50,
  "start": "2026-08-15", "end": "2026-09-30" }
```

**2. What the server actually charges** —
[`supabase/functions/_shared/config.ts`](../supabase/functions/_shared/config.ts)

```ts
{ id: 'early', label: 'Early Bird', ghs: 200, usd: 50, start: '2026-08-15', end: '2026-09-30' },
```

The numbers and dates must be identical.

**3. Also update the words people read** — the fee is written in plain English in two more
places:
- `src/components/hero.html` — the "from 200 GH₵" line
- `src/data/faqs.json` — the "How much does registration cost?" answer

**4. Publish:**

```bash
node build.js
npx supabase functions deploy register --no-verify-jwt
```

Both commands. The first updates the website, the second updates what actually charges people.

---

## Add, remove, or reword a question

**1. Edit** [`src/data/registration.json`](../src/data/registration.json):

```json
{
  "name": "hometown",
  "label": "Which town are you from?",
  "type": "text",
  "required": true
}
```

`type` can be `text`, `email`, `tel`, `number`, `textarea`, `radio` or `file`.
For `radio`, add `"choices": ["Yes", "No"]`, and `"other": true` if you want an
"Other" box that appears when picked.

**2. If it's a NEW question, it also needs a home in the database.** Supabase → SQL Editor:

```sql
alter table public.registrations add column hometown text;
```

**3. And the server needs to know about it** — add a matching line to `FIELDS` in
[`supabase/functions/register/index.ts`](../supabase/functions/register/index.ts):

```ts
{ name: 'hometown', column: 'hometown', label: 'Hometown', required: true, max: 100 },
```

**4. Publish:**

```bash
node build.js
npx supabase functions deploy register --no-verify-jwt
```

> **Just rewording a question?** Only step 1 and `node build.js` are needed.
> The `name` is the internal ID — leave it alone. The `label` is what people read.

---

## Change wording on the site

| To change | Edit |
|---|---|
| Homepage headline, hero text, dates | `src/components/hero.html` |
| "About" section | `src/components/about.html` |
| Winners section | `src/components/winners.html` |
| FAQs | `src/data/faqs.json` |
| Schedule | `src/data/schedule.json` |
| Footer, contact email | `src/components/footer.html` |
| Registration page heading | `src/shell-register.html` |
| The About page | `about.html` — hand-edited, **not** generated |

Then:

```bash
node build.js
```

---

## See who has registered

Supabase dashboard → **Table Editor**.

| View | Shows |
|---|---|
| `registrations_paid` | completed entries — money received |
| `registrations_unpaid` | submitted but not paid — abandoned or still deciding |
| `registrations` | everyone, both kinds |

**To export:** open a view → Export → CSV.

**To see someone's photo:** the `photo_path` column holds its location. Storage →
`registration-photos` → browse to that path. The bucket is private, so there is no public
link — which is the point.

---

## Turn on email notifications

```bash
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
npx supabase secrets set NOTIFY_EMAIL=your-address@example.com
npx supabase functions deploy register --no-verify-jwt
```

Until a domain is verified with Resend, **it will only deliver to the address that owns the
Resend account.** Point `NOTIFY_EMAIL` there or nothing arrives.

**To send from your own domain** (better, and looks official):

1. Resend → Domains → add `missecoghana.com`
2. Add the DNS records it gives you at your domain registrar
   ⚠️ You already send mail from `info@missecoghana.com`. A domain can only have **one** SPF
   record — if Resend asks for one and you already have one, **merge them**, don't add a second.
3. Once verified:

```bash
npx supabase secrets set MAIL_FROM="Miss Eco Ghana <registrations@missecoghana.com>"
npx supabase secrets set NOTIFY_EMAIL=globalelegancepageantsghana@gmail.com
npx supabase functions deploy register --no-verify-jwt
```

---

## Test the form outside the registration window

Before 15 August the submit button is switched off, and the server refuses submissions too.
To test without opening the form to the public, use the built-in bypass:

```bash
# 1. Turn it on with any password you invent
npx supabase secrets set TEST_BYPASS_TOKEN=some-secret-you-choose
npx supabase functions deploy register --no-verify-jwt

# 2. Submit with that password in the header (example)
curl -X POST https://eisqaarydwtsarlghdjs.supabase.co/functions/v1/register \
  -H "x-test-bypass: some-secret-you-choose" \
  --form-string "fullName=Test Person" \
  --form-string "email=test@example.com" \
  ... \
  -F "photo=@assets/logo-final.png;type=image/png"

# 3. ALWAYS turn it off again
npx supabase secrets unset TEST_BYPASS_TOKEN
npx supabase functions deploy register --no-verify-jwt
```

Two gotchas:
- Use `--form-string` for text, not `-F`. With `-F`, a value starting with `@` (like an
  Instagram handle) makes curl try to open a *file* of that name and fail.
- The bypass does nothing unless the secret is set **and** the header matches. Turning the
  secret off disables it completely.

Afterwards, delete your test entry in Table Editor.

---

## Add or replace an image

1. Put the file in `assets/`.
2. Reference it from the relevant file in `src/components/`.
3. `node build.js`

**Keep images small.** The images in the scrolling strip at the bottom of the page display at
roughly 215 pixels wide — a 1200-pixel photo there is about 25 times more data than needed and
makes the site slow. Resize before adding: around **600 pixels wide** is plenty for that strip.

---

## Publish the website

The site is plain files. Upload `index.html`, `register.html`, `about.html`, `style.css` and
the `assets/` folder to your web host.

Always run `node build.js` first, and check it finished without errors.

---

## Deploy a change to the server programs

```bash
npx supabase functions deploy register --no-verify-jwt
npx supabase functions deploy hubtel-callback --no-verify-jwt
```

The `--no-verify-jwt` flag is required every time. Without it the form gets rejected with a
401 error.

---

## Before opening registration — checklist

- [ ] `ALLOWED_ORIGIN` set to the real site address, not `*`
- [ ] `RESEND_API_KEY` and `NOTIFY_EMAIL` set, and a test email actually received
- [ ] `TEST_BYPASS_TOKEN` **not** set
- [ ] `ALLOW_ANY_CALLBACK_IP` **not** set
- [ ] Fees and dates match in `registration.json` and `_shared/config.ts`
- [ ] One real payment tested all the way through with a Hubtel test account
- [ ] Test entries deleted from `registrations` and from storage
- [ ] Someone knows to watch for the two email subjects:
      `New application (UNPAID)` and `PAYMENT RECEIVED`
