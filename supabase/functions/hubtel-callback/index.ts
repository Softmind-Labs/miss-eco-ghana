// POST /hubtel-callback — Hubtel payment notification.
//
// SECURITY: Hubtel does not sign callbacks with an HMAC signature. This
// endpoint is a public webhook URL, so the defences are:
//
//   1. client_reference is a cryptographically random 32-character token (128-bit
//      entropy). You cannot settle or trigger notifications for a registration
//      without knowing its unguessable reference.
//   2. The paid amount must cover the fee locked in at submission time.
//   3. Source IP logging and optional IP whitelisting (via ALLOWED_CALLBACK_IPS /
//      ENFORCE_CALLBACK_IP).
//
// Deploy: npx supabase functions deploy hubtel-callback --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cors, esc, json } from '../_shared/config.ts';
import { layout, send } from '../_shared/notify.ts';

const supabase = () =>
    createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // ── 1. Source IP & Audit Logging ─────────────────────────────────────────
    const fwd = req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? '';
    console.log(`[hubtel-callback] Webhook request received from IP: ${fwd || 'unknown'}`);

    const enforceIp = Deno.env.get('ENFORCE_CALLBACK_IP') === '1';
    if (enforceIp) {
        const allowedIps = (Deno.env.get('ALLOWED_CALLBACK_IPS') ?? '108.129.40.25')
            .split(',')
            .map((ip) => ip.trim())
            .filter(Boolean);

        const ipOk = fwd.split(',').some((p) => allowedIps.includes(p.trim()));
        if (!ipOk && Deno.env.get('ALLOW_ANY_CALLBACK_IP') !== '1') {
            console.warn('[hubtel-callback] Callback rejected due to unrecognized IP:', fwd);
            return json({ error: 'Forbidden' }, 403);
        }
    }

    const body = await req.json().catch((err) => {
        console.error('[hubtel-callback] Failed to parse incoming JSON payload:', err);
        return null;
    });

    console.log('[hubtel-callback] Incoming payload:', JSON.stringify(body));

    const data = body?.Data ?? body?.data ?? body;
    const reference: string | undefined = data?.ClientReference ?? body?.ClientReference;

    if (!reference) {
        console.warn('[hubtel-callback] Callback missing ClientReference:', JSON.stringify(body));
        return json({ ok: true }); // nothing to retry — don't make Hubtel resend
    }

    const db = supabase();

    // ── 2. Existence check in database ──────────────────────────────────────
    const { data: reg, error: lookupError } = await db
        .from('registrations')
        .select('id, full_name, email, fee_ghs, tier, payment_status')
        .eq('client_reference', reference)
        .maybeSingle();

    if (lookupError) {
        console.error(`[hubtel-callback] Lookup error for ref ${reference}:`, lookupError);
        return json({ error: 'lookup failed' }, 500); // genuine failure — retry welcome
    }
    if (!reg) {
        console.warn(`[hubtel-callback] Callback for unknown reference: ${reference}`);
        return json({ ok: true }); // not ours; don't invite retries
    }

    // ── 3. Did it actually succeed? ─────────────────────────────────────────
    // Hubtel returns ResponseCode "0000" or "00", and status strings like
    // "Success", "Completed", or "Paid" (casing may vary by channel).
    const responseCode = String(body?.ResponseCode ?? body?.responseCode ?? '');
    const statusRaw = String(data?.Status ?? data?.status ?? body?.Status ?? '').toLowerCase();

    const isSuccessCode = responseCode === '0000' || responseCode === '00';
    const isSuccessStatus = ['success', 'completed', 'paid'].includes(statusRaw);

    const succeeded = isSuccessCode || isSuccessStatus;

    if (!succeeded) {
        console.log(`[hubtel-callback] Payment not marked successful for ref ${reference} (code: "${responseCode}", status: "${statusRaw}")`);
        await db.from('registrations')
            .update({ payment_status: 'failed' })
            .eq('client_reference', reference)
            .eq('payment_status', 'pending'); // never downgrade an already paid row
        return json({ ok: true });
    }

    // ── 4. Amount must cover the fee we quoted at submission ────────────────
    const rawAmount = data?.Amount ?? data?.amount ?? data?.AmountAfterCharges ?? data?.AmountPaid ?? body?.Amount ?? 0;
    const paid = Number(rawAmount);

    if (!Number.isFinite(paid) || paid + 0.001 < Number(reg.fee_ghs)) {
        console.warn(`[hubtel-callback] Underpayment for ref ${reference}: paid ${paid}, expected ${reg.fee_ghs}`);
        return json({ ok: true }); // leave pending for manual review
    }

    const transactionId = data?.CheckoutId ?? data?.TransactionId ?? data?.hubtelTransactionId ?? body?.TransactionId ?? null;
    const paymentMethod = data?.PaymentDetails?.PaymentType ?? data?.PaymentType ?? data?.Channel ?? null;

    // ── 5. Guard A — settle, exactly once ───────────────────────────────────
    // The row count IS the idempotency check: a replayed callback matches zero rows.
    const { data: settled } = await db
        .from('registrations')
        .update({
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
            amount_paid_ghs: paid,
            payment_method: paymentMethod,
            hubtel_transaction_id: transactionId,
        })
        .eq('client_reference', reference)
        .neq('payment_status', 'paid')
        .select('id');

    if (settled?.length) {
        console.log(`[hubtel-callback] Successfully settled payment_status='paid' for ref: ${reference}`);
    }

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
        console.log(`[hubtel-callback] Dispatching 'PAYMENT RECEIVED' notification for ${win.full_name} (${win.email})`);
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
            console.error(`[hubtel-callback] Email sending failed for ${win.full_name}, releasing claim for future retry.`);
            await db.from('registrations')
                .update({ notified_at: null })
                .eq('id', win.id);
        } else {
            console.log(`[hubtel-callback] 'PAYMENT RECEIVED' email sent successfully for ${win.full_name}`);
        }
    } else {
        console.log(`[hubtel-callback] Notification already claimed or row not eligible for ref: ${reference}`);
    }

    // Always 200 once handled — a non-2xx makes Hubtel retry indefinitely.
    return json({ ok: true });
});

