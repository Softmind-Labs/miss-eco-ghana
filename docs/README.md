# Miss Eco Ghana — start here

The website and the contestant registration system.

## I want to…

| … | Read |
|---|---|
| Understand how the whole thing works | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Fix something that's broken | [RUNBOOK.md](RUNBOOK.md) |
| Change a fee, a date, a question, or some text | [OPERATIONS.md](OPERATIONS.md) |

---

## The one rule

**Never edit `index.html` or `register.html` directly.**

They are *generated*. Running `node build.js` rebuilds them from the `src/` folder and
throws away anything you typed into them.

Edit files in `src/`, then run:

```bash
node build.js
```

*(This has already caused a real bug once. A fix was made straight into `index.html` and
would have vanished on the next build.)*

`about.html` is the exception — it is hand-written and not generated.

---

## What this project is, in 60 seconds

A **static website**. Plain HTML and CSS, no framework. Originally exported from Webflow.

It has three pages:

| Page | Generated? | Built from |
|---|---|---|
| `index.html` — homepage | yes | `src/shell.html` |
| `register.html` — the entry form | yes | `src/shell-register.html` |
| `about.html` | **no** — hand-edited | itself |

Because a plain website can't keep secrets or talk to a database safely, the registration
form sends its data to two small programs running on **Supabase**:

- **`register`** — receives an application, saves it, starts the payment
- **`hubtel-callback`** — hears back from Hubtel when someone pays

Money is handled by **Hubtel** (mobile money and cards). Email is sent by **Resend**.

---

## The pieces, and who owns them

| Thing | Where it lives | What it's for |
|---|---|---|
| Website files | this repo | the pages people see |
| Database + file storage | Supabase | applications and photos |
| The two small programs | Supabase | the work a webpage can't do safely |
| Payments | Hubtel | taking money |
| Email | Resend | telling you about applications |

**Supabase project:** `miss-eco-ghana` · ref `eisqaarydwtsarlghdjs` · region eu-west-1

---

## Current status

| Part | State |
|---|---|
| Website, form, validation | ✅ working |
| Saving applications + photos | ✅ tested end to end |
| Starting a Hubtel payment | ✅ tested — real checkout created |
| Emails | ⚠️ code is done, **key not set yet** — nothing sends |
| Confirming a payment (the callback) | ⚠️ written, never tested with real money |

Registration opens **15 August**. Before that date the form is visible but the submit
button is switched off, on purpose.
