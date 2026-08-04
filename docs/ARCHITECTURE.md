# How it works

Follow one person from opening the page to paying. Six stages.

---

## The shape of it

```
   Applicant's browser
           |
           |  fills in the form
           v
   register  (a small program on Supabase)
           |
           +---> saves the application  -> Supabase database
           +---> saves the photo        -> Supabase storage
           +---> emails you             -> "New application (UNPAID)"
           +---> asks Hubtel for a payment page
           |
           v
   Hubtel checkout page  (mobile money / card)
           |
           +---> sends them back to the site   (just a thank-you message)
           |
           +---> tells hubtel-callback they paid   <-- this is the part that counts
                         |
                         +---> marks them paid
                         +---> emails you "PAYMENT RECEIVED"
```

---

## Stage 1 — The page loads

The visitor opens `register.html`. Three things were built into that file:

1. **The questions** — from [`src/data/registration.json`](../src/data/registration.json).
   That file is the master list. Add a question there, run `node build.js`, and it appears.
2. **A settings block** — the fees, the dates, and the web address of the `register` program.
   This is public. Anyone can view it. That's fine; there are no passwords in it.
3. **The page's brain** — [`src/js/registration.js`](../src/js/registration.js).

The brain compares today's date to the fee dates and picks one of three states:

| Today's date | What the visitor sees |
|---|---|
| Before 15 August | Form visible, **submit button switched off**, "Registration opens 15 August" |
| 15 Aug – 31 Oct | Form works, current fee shown |
| After 31 October | Form visible, submit off, "Registration closed" |

The questions are always readable, even when submitting is off, so applicants can prepare
their answers and photo in advance.

## Stage 2 — They fill it in

16 questions. Four of them have an **"Other"** choice that reveals a text box when picked.
A photo is required, up to 10 MB.

When they press submit the browser checks the answers first and shows any problems straight
away — no waiting for the server.

> **This checking is for convenience, not safety.** Anyone can bypass a browser. The server
> checks everything again from scratch. Never rely on the browser for anything that matters.

## Stage 3 — Off to the server

The browser sends the answers and the photo to the `register` program.

It sends **no passwords or keys**. It only knows a web address. This is deliberate: there is
nothing in the browser worth stealing.

## Stage 4 — The server decides

[`supabase/functions/register/index.ts`](../supabase/functions/register/index.ts)

In order:

1. **Checks every answer again.** Ignores whatever the browser said.
2. **Checks today's date on the server's own clock** to decide the fee. Someone changing the
   date on their laptop achieves nothing.
3. **Saves the photo** into a private storage area. Private means no public link exists.
4. **Creates a 32-character random code** for this application. It's used as the payment
   reference — and as a security token. Stage 6 explains why.
5. **Looks up the email address:**

   | Found | What happens |
   |---|---|
   | Already **paid** | Rejected — "you have already registered" |
   | Already there, **unpaid** | That entry is **replaced** with the new answers and a fresh payment link |
   | Not found | A new entry is created |

   That middle row matters. Without it, anyone who started a payment and gave up would be
   permanently locked out and unable to try again.

6. **Emails you** — subject `New application (UNPAID)` — with every answer and a photo link.
7. **Asks Hubtel to create a payment page** and passes the link back to the browser.

> If Hubtel can't be reached, **the application is still saved.** The applicant is told
> you'll email them a payment link. A payment problem never loses an application.

## Stage 5 — Paying

The browser sends them to Hubtel's payment page. They pay by mobile money or card.

Then **two separate things happen, and only one of them counts:**

**A. They are sent back to your site** and see a thank-you message.
→ **This proves nothing.** Anyone could type that web address themselves. It is only friendly
words on a screen.

**B. Hubtel quietly contacts your `hubtel-callback` program.**
→ **This is the only thing that ever marks someone as paid.**

Keeping these separate is the most important idea in the system. People close tabs and lose
signal all the time. If you trusted the "sent back to your site" part, you would both miss
real payments and be easy to cheat.

## Stage 6 — Confirming the payment

[`supabase/functions/hubtel-callback/index.ts`](../supabase/functions/hubtel-callback/index.ts)

Hubtel **does not sign** its messages. There is no way to mathematically prove a message came
from them. So this program is suspicious by design:

1. **Is it really Hubtel?** The message must arrive from `108.129.40.25`. Anything else is
   refused. *(Tested: a fake "you have been paid 200 GHS" message from elsewhere was rejected.)*
2. **Do we recognise the code?** It's 32 random characters. You cannot confirm a payment for
   an application whose code you can't guess.
3. **Did it really succeed, and does the amount cover the fee** we quoted?
4. **Mark them paid — once.**
5. **Email you "PAYMENT RECEIVED" — once.**

### Why "once" took care

Hubtel sends the message again if it doesn't get a clean reply. So the same payment can arrive
three or four times.

Steps 4 and 5 are checked **separately, on purpose.**

The tempting version is "only send the email if marking-them-paid worked". That version has a
hole: if the program dies in between, the retry finds them already marked paid, decides there's
nothing to do, and **that email is lost forever.**

Kept separate, the retry skips step 4 and still does step 5. Nothing is lost.

---

## Where the secrets live

Nothing sensitive is in this repo or in anyone's browser. Passwords and keys are stored in
Supabase's secret store, which only the two programs can read.

| Value | Kept where | In the repo? |
|---|---|---|
| Web address of the `register` program | `src/data/registration.json` | ✅ public, harmless |
| Database master key | Supabase, automatic | ❌ never |
| Hubtel keys | Supabase secrets | ❌ never |
| Resend email key | Supabase secrets | ❌ never |

**This is the entire reason those two small programs exist.** A plain webpage cannot keep a
secret, so it cannot be trusted to talk to a database or take a payment directly.

---

## How the website gets built

`node build.js` takes the pieces in `src/` and assembles the finished pages.

| Piece | What it is |
|---|---|
| `src/shell.html` | the skeleton of the homepage |
| `src/shell-register.html` | the skeleton of the registration page |
| `src/components/*.html` | reusable chunks — header, footer, hero, etc. |
| `src/data/*.json` | content — questions, FAQs, schedule, fees |
| `src/css/`, `src/js/` | styles and the page brain |

It works by finding special comments and swapping them for real content:

| Comment in a shell file | Replaced with |
|---|---|
| `<!-- INCLUDE:components/header.html -->` | that file's contents |
| `<!-- DATA:faqs -->` | the FAQ list, built from `faqs.json` |
| `<!-- DATA:registration-form -->` | the whole form, built from `registration.json` |
| `{{HOME}}` | nothing on the homepage, `index.html` on other pages |

That last one lets a single shared header work correctly on every page — on the homepage the
menu links jump down the page, and elsewhere they link back to the homepage first.

---

## ⚠️ The one real trap

**Fees and dates are written in two places, and they must match:**

| File | Controls |
|---|---|
| [`src/data/registration.json`](../src/data/registration.json) | what the **page shows** |
| [`supabase/functions/_shared/config.ts`](../supabase/functions/_shared/config.ts) | what the **server actually charges** |

Change one and forget the other, and your page advertises a price the server refuses to honour.

Nothing checks this for you. It is the most likely future bug in this project.
See [OPERATIONS.md](OPERATIONS.md) for the correct way to change a fee.
