// Shared by the register and hubtel-callback functions.

/** Fee tiers. Kept in sync BY HAND with src/data/registration.json.
 *
 *  The copy in registration.json drives what the page displays; this copy is
 *  authoritative, because the fee must never depend on the visitor's clock.
 *  If you change a date or an amount, change it in BOTH places. */
export const TIERS = [
    { id: 'early', label: 'Early Bird', ghs: 200, usd: 50, start: '2026-08-15', end: '2026-09-30' },
    { id: 'late', label: 'Late Registration', ghs: 300, usd: 75, start: '2026-10-01', end: '2026-10-31' },
];

export type Tier = typeof TIERS[number];

/** Which tier is open right now? Null means registration is closed. */
export function resolveTier(now: Date): Tier | null {
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
    return TIERS.find((t) => today >= t.start && today <= t.end) ?? null;
}

export function corsHeaders(reqOrOrigin?: Request | string) {
    const origin = typeof reqOrOrigin === 'string'
        ? reqOrOrigin
        : (reqOrOrigin?.headers.get('origin') ?? '');

    const configured = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
    const allowedList = configured.split(',').map((s) => s.trim()).filter(Boolean);

    let allowOrigin = configured;
    if (configured === '*' || allowedList.includes(origin)) {
        allowOrigin = origin || '*';
    } else if (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
    ) {
        allowOrigin = origin; // auto-allow local dev servers (Live Server, Vite, etc.)
    } else if (allowedList.length > 0) {
        allowOrigin = allowedList[0];
    }

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-test-bypass',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

export const cors = corsHeaders();

export const json = (body: unknown, status = 200, req?: Request) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });

/** Escape before interpolating applicant-supplied text into an HTML email. */
export const esc = (v: unknown) =>
    String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
