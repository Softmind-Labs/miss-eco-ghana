// POST /hubtel-callback — Hubtel payment notification.
//
// SECURITY: Hubtel does not sign callbacks. There is no HMAC to verify. This
// endpoint is a public URL that anyone can POST to, so the defences are:
//
//   1. Source IP must be Hubtel's (108.129.40.25) — their own documented control.
//   2. client_reference is a random 32-char token; you can't settle a registration
//      you can't name.
//   3. The paid amount must cover the fee we locked in at submission time.
//
// The stronger control — Hubtel's Transaction Status Check API — is deliberately
// NOT used yet, because it is IP-whitelisted and Supabase Edge Functions have no
// static outbound IP. Consequence: if a callback is never delivered, that row stays
// 'pending' until someone reconciles it by hand in the Hubtel dashboard.
//
// Deploy: npx supabase functions deploy hubtel-callback --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cors, esc, json } from '../_shared/config.ts';
import { layout, send } from '../_shared/notify.ts';

const HUBTEL_CALLBACK_IP = '108.129.40.25';

const supabase = () =>
    createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // ── 1. Source IP ────────────────────────────────────────────────────────
    // Set `ALLOW_ANY_CALLBACK_IP=1` only while testing with curl or webhook.site.
    const fwd = req.headers.get('x-forwarded-for') ?? '';
    const ipOk = fwd.split(',').some((p) => p.trim() === HUBTEL_CALLBACK_IP);
    if (!ipOk && Deno.env.get('ALLOW_ANY_CALLBACK_IP') !== '1') {
        console.warn('callback rejected, unexpected source ip:', fwd);
        return json({ error: 'Forbidden' }, 403);
    }

    const body = await req.json().catch(() => null);
    const data = body?.Data;
    const reference: string | undefined = data?.ClientReference;

    if (!reference) {
        console.warn('callback with no ClientReference', JSON.stringify(body));
        return json({ ok: true }); // nothing to retry — don't make Hubtel resend
    }

    const db = supabase();

    // ── 2. Cheap existence check before doing any real work ─────────────────
    const { data: reg, error: lookupError } = await db
        .from('registrations')
        .select('id, full_name, email, fee_ghs, tier, payment_status')
        .eq('client_reference', reference)
        .maybeSingle();

    if (lookupError) {
        console.error('lookup failed', lookupError);
        return json({ error: 'lookup failed' }, 500); // genuine failure — retry welcome
    }
    if (!reg) {
        console.warn('callback for unknown reference', reference);
        return json({ ok: true }); // not ours; don't invite retries
    }

    // ── 3. Did it actually succeed? ─────────────────────────────────────────
    const succeeded = body?.ResponseCode === '0000' && data?.Status === 'Success';
    if (!succeeded) {
        console.log(`payment not successful for ${reference}: ${data?.Status}`);
        await db.from('registrations')
            .update({ payment_status: 'failed' })
            .eq('client_reference', reference)
            .eq('payment_status', 'pending'); // never downgrade a paid row
        return json({ ok: true });
    }

    // ── 4. Amount must cover the fee we quoted at submission ────────────────
    const paid = Number(data?.Amount ?? 0);
    if (!Number.isFinite(paid) || paid + 0.001 < Number(reg.fee_ghs)) {
        console.warn(`underpayment for ${reference}: paid ${paid}, expected ${reg.fee_ghs}`);
        return json({ ok: true }); // leave pending for manual review
    }

    // ── 5. Guard A — settle, exactly once ───────────────────────────────────
    // The row count IS the idempotency check: a replayed callback matches zero rows.
    const { data: settled } = await db
        .from('registrations')
        .update({
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
            amount_paid_ghs: paid,
            payment_method: data?.PaymentDetails?.PaymentType ?? null,
            hubtel_transaction_id: data?.CheckoutId ?? null,
        })
        .eq('client_reference', reference)
        .neq('payment_status', 'paid')
        .select('id');

    if (settled?.length) console.log(`settled ${reference}`);

    // ── 6. Guard B — claim the notification, INDEPENDENT of Guard A ─────────
    // Deliberately not nested inside "did A win?". If the process dies after A
    // commits but before the email sends, the retry loses A — and if B were nested
    // we'd return early and the notification would be lost forever. Kept separate,
    // the retry loses A but wins B and still sends.
    const { data: claimed } = await db
        .from('registrations')
        .update({ notified_at: new Date().toISOString() })
        .eq('client_reference', reference)
        .eq('payment_status', 'paid')
        .is('notified_at', null)
        .select('id, full_name, email, fee_ghs, tier');

    const win = claimed?.[0];
    if (win) {
        const sent = await send(
            `PAYMENT RECEIVED — ${win.full_name} (${paid} GHS)`,
            layout(
                `Payment received — ${win.full_name}`,
                `${esc(String(win.tier))} · ${esc(String(paid))} GH&#8373; · ref <code>${esc(reference)}</code>`,
                `<p style="font-size:14px;">This registration is now complete and paid.
                  <a href="mailto:${esc(win.email)}">${esc(win.email)}</a></p>`,
            ),
            win.email,
        );

        // Release the claim so a later retry can try again, rather than silently
        // never notifying. Small window for a double-send; better than a lost one.
        if (!sent) {
            await db.from('registrations')
                .update({ notified_at: null })
                .eq('id', win.id);
        }
    }

    // Always 200 once handled — a non-2xx makes Hubtel retry indefinitely.
    return json({ ok: true });
});
