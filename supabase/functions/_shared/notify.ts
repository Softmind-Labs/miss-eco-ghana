// Resend notifications.
//
// Two distinct emails so the inbox sorts itself:
//   "New application (UNPAID) — <name>"   on submit
//   "PAYMENT RECEIVED — <name>"           when money lands
//
// Every send is best-effort. A registration is already safely stored by the time
// we get here, so a mail failure must never turn into an error for the applicant.
// The caller decides whether to retry — see notified_at in the callback function.

import { esc } from './config.ts';

/** Comma-separate NOTIFY_EMAIL for multiple recipients. Until a domain is verified
 *  in Resend, it will ONLY deliver to the address that owns the Resend account. */
const recipients = () =>
    (Deno.env.get('NOTIFY_EMAIL') ?? 'globalelegancepageantsghana@gmail.com')
        .split(',').map((a) => a.trim()).filter(Boolean);

/** Returns true only on a confirmed 200 from Resend. */
export async function send(
    subject: string,
    html: string,
    replyTo?: string,
): Promise<boolean> {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) {
        console.log(`RESEND_API_KEY unset — skipping email: ${subject}`);
        return false;
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: Deno.env.get('MAIL_FROM') ?? 'Miss Eco Ghana <onboarding@resend.dev>',
                to: recipients(),
                reply_to: replyTo,
                subject,
                html,
            }),
        });
        if (!res.ok) {
            console.error('resend rejected the send', res.status, await res.text());
            return false;
        }
        return true;
    } catch (e) {
        console.error('resend threw', e);
        return false;
    }
}

export const layout = (heading: string, sub: string, body: string) => `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="margin:0 0 4px;font-size:20px;">${esc(heading)}</h2>
      <p style="margin:0 0 20px;color:#666;font-size:13px;">${sub}</p>
      ${body}
    </div>`;

export const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #eee;vertical-align:top;width:38%;color:#666;font-size:13px;">${esc(label)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px;white-space:pre-wrap;">${esc(value)}</td>
    </tr>`;
