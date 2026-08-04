// Hubtel Online Checkout (redirect).
//
// Three constraints here fail at RUNTIME, not compile time, so they're enforced
// in code rather than left to a reviewer to remember:
//
//   1. clientReference is capped at 32 characters. A dashed UUID is 36 and gets
//      rejected — hence the stripped form below, which is exactly 32.
//   2. totalAmount is decimal GH₵ ("200.00"). Hubtel is NOT Paystack; there are
//      no pesewas/minor units. Sending 20000 charges a hundred times too much.
//   3. description rejects special characters. Hubtel error 2001 names &*!%@
//      specifically, and applicant names flow into this field.

const INITIATE_URL = 'https://payproxyapi.hubtel.com/items/initiate';

/** Exactly 32 chars — Hubtel's limit — and random, because Hubtel does not sign
 *  callbacks, so this doubles as the token that proves a callback is about a real
 *  registration. Never make this sequential. */
export const newClientReference = () => crypto.randomUUID().replace(/-/g, '');

/** Hubtel rejects &*!%@ and friends (error 2001). Keep letters, digits, spaces,
 *  hyphens and full stops; collapse the rest. */
export const safeDescription = (s: string, max = 100) =>
    s.replace(/[^A-Za-z0-9 .\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const auth = () => {
    const id = Deno.env.get('HUBTEL_CLIENT_ID') ?? '';
    const secret = Deno.env.get('HUBTEL_CLIENT_SECRET') ?? '';
    return 'Basic ' + btoa(`${id}:${secret}`);
};

export interface CheckoutResult {
    checkoutUrl: string;
    checkoutId: string;
}

/**
 * Create a checkout. Returns null on any failure — the caller must treat that as
 * "application saved, payment not started" rather than as a failed registration.
 */
export async function initiateCheckout(opts: {
    amountGhs: number;
    description: string;
    clientReference: string;
    payeeName?: string;
    payeeEmail?: string;
    payeeMobileNumber?: string;
}): Promise<CheckoutResult | null> {
    const site = Deno.env.get('SITE_URL') ?? 'https://missecoghana.com';
    const callbackUrl = Deno.env.get('HUBTEL_CALLBACK_URL');
    const merchantAccountNumber = Deno.env.get('HUBTEL_MERCHANT_ACCOUNT');

    if (!callbackUrl || !merchantAccountNumber) {
        console.error('hubtel not configured: HUBTEL_CALLBACK_URL / HUBTEL_MERCHANT_ACCOUNT unset');
        return null;
    }

    const body = {
        // Two decimal places, in cedis. Not minor units.
        totalAmount: Number(opts.amountGhs.toFixed(2)),
        description: safeDescription(opts.description),
        callbackUrl,
        returnUrl: `${site}/register.html?ref=${opts.clientReference}`,
        cancellationUrl: `${site}/register.html?cancelled=1`,
        merchantAccountNumber,
        clientReference: opts.clientReference,
        payeeName: opts.payeeName ? safeDescription(opts.payeeName, 60) : undefined,
        payeeEmail: opts.payeeEmail,
        payeeMobileNumber: opts.payeeMobileNumber,
    };

    try {
        const res = await fetch(INITIATE_URL, {
            method: 'POST',
            headers: { Authorization: auth(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const out = await res.json().catch(() => null);

        // "0000" on initiate means accepted — proceed with the returned URL.
        if (!res.ok || out?.responseCode !== '0000' || !out?.data?.checkoutUrl) {
            console.error('hubtel initiate failed', res.status, JSON.stringify(out));
            return null;
        }
        return { checkoutUrl: out.data.checkoutUrl, checkoutId: out.data.checkoutId };
    } catch (e) {
        console.error('hubtel initiate threw', e);
        return null;
    }
}
