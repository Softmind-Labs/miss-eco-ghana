// POST /register — Miss Eco Ghana contestant registration.
//
// Takes multipart/form-data (the headshot is a required field, so JSON won't do),
// validates it, stores the photo in a private bucket, writes the row with the
// service role, then notifies the team via Resend.
//
// Nothing here is reachable from the browser except the URL itself: the service
// role key and the Resend key are Edge Function secrets, and the registrations
// table has RLS on with no policies.
//
// Deploy:  npx supabase functions deploy register
// Secrets: npx supabase secrets set RESEND_API_KEY=... ALLOWED_ORIGIN=... MAIL_FROM=...

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Config ──────────────────────────────────────────────────────────────────

// Overridable via `supabase secrets set NOTIFY_EMAIL=...`. Until a domain is
// verified in Resend, it will only deliver to the address that owns the Resend
// account — so during setup this may need to point somewhere else. Comma-separate
// for multiple recipients.
const NOTIFY_EMAIL = (Deno.env.get('NOTIFY_EMAIL') ?? 'globalelegancepageantsghana@gmail.com')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
const BUCKET = 'registration-photos';
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB, matching the form
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

// Kept in sync by hand with src/data/registration.json. The client copy drives
// what the page displays; this copy is authoritative, because the fee must not
// depend on the visitor's system clock.
const TIERS = [
    { id: 'early', label: 'Early Bird', ghs: 200, usd: 50, start: '2026-08-15', end: '2026-09-30' },
    { id: 'late', label: 'Late Registration', ghs: 300, usd: 75, start: '2026-10-01', end: '2026-10-31' },
];

// ─── Field spec ──────────────────────────────────────────────────────────────
// Drives validation and the notification email, so adding a question is a
// one-line change rather than an edit in four places.

interface Field {
    name: string;
    column: string;
    label: string;
    required?: boolean;
    max?: number;
    kind?: 'email' | 'phone' | 'age';
    choices?: string[];
    /** Name of the companion free-text field revealed when "Other" is picked. */
    otherField?: string;
}

const FIELDS: Field[] = [
    { name: 'fullName', column: 'full_name', label: 'Full name', required: true, max: 120 },
    { name: 'email', column: 'email', label: 'Email address', required: true, max: 254, kind: 'email' },
    { name: 'phone', column: 'phone', label: 'Phone number', required: true, max: 40, kind: 'phone' },
    { name: 'age', column: 'age', label: 'Age', required: true, kind: 'age' },
    { name: 'instagramHandle', column: 'instagram_handle', label: 'Instagram handle', required: true, max: 80 },
    { name: 'tiktokHandle', column: 'tiktok_handle', label: 'TikTok handle', required: true, max: 80 },
    {
        name: 'heardFrom', column: 'heard_from', label: 'How did you hear about this competition?',
        required: true, choices: ['Instagram', 'Tiktok', 'A friend', 'Other'], otherField: 'heardFromOther',
    },
    { name: 'heardFromOther', column: 'heard_from_other', label: 'Heard about us — other', max: 200 },
    {
        name: 'environmentalView', column: 'environmental_view', required: true, max: 4000,
        label: 'Environmental problems in Ghana & recommendations',
    },
    {
        name: 'standoutQualities', column: 'standout_qualities', required: true, max: 2000,
        label: '3 qualities that stand out',
    },
    {
        name: 'contestedBefore', column: 'contested_before', label: 'Contested in a pageant before?',
        required: true, choices: ['Yes', 'No', 'Maybe'],
    },
    {
        name: 'hasPassport', column: 'has_passport', label: 'Has a valid passport?',
        required: true, choices: ['Yes', 'No', 'Other'], otherField: 'hasPassportOther',
    },
    { name: 'hasPassportOther', column: 'has_passport_other', label: 'Passport — other', max: 200 },
    {
        name: 'hasSupport', column: 'has_support', label: 'Has the necessary support?',
        required: true, choices: ['Yes', 'No', 'Maybe'],
    },
    {
        name: 'bikiniComfort', column: 'bikini_comfort', label: 'Comfortable with bikini shoots?',
        choices: ['Yes', 'No', 'Maybe'], // optional on the form — no asterisk
    },
    {
        name: 'occupation', column: 'occupation', label: 'What do you do?',
        required: true, choices: ['Student', 'Worker', 'Entrepreneur', 'Other'], otherField: 'occupationOther',
    },
    { name: 'occupationOther', column: 'occupation_other', label: 'Occupation — other', max: 200 },
    {
        name: 'hasWhatItTakes', column: 'has_what_it_takes', label: 'Has what it takes to be the next Miss Eco Ghana?',
        required: true, choices: ['Yes', 'No', 'Maybe', 'Other'], otherField: 'hasWhatItTakesOther',
    },
    { name: 'hasWhatItTakesOther', column: 'has_what_it_takes_other', label: 'Has what it takes — other', max: 200 },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const cors = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });

/** Escape before interpolating applicant text into the notification email. */
const esc = (v: unknown) =>
    String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Which fee tier is open right now? Null means registration is closed. */
function resolveTier(now: Date) {
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
    return TIERS.find((t) => today >= t.start && today <= t.end) ?? null;
}

function validate(values: Record<string, string>) {
    const errors: Record<string, string> = {};

    for (const field of FIELDS) {
        const raw = (values[field.name] ?? '').trim();

        if (!raw) {
            if (field.required) errors[field.name] = `${field.label} is required.`;
            continue;
        }
        if (field.max && raw.length > field.max) {
            errors[field.name] = `${field.label} must be under ${field.max} characters.`;
            continue;
        }
        if (field.choices && !field.choices.includes(raw)) {
            errors[field.name] = `${field.label} has an unexpected value.`;
            continue;
        }
        if (field.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) {
            errors[field.name] = 'Enter a valid email address.';
        }
        if (field.kind === 'phone' && !/^\+?[\d\s()-]{7,}$/.test(raw)) {
            errors[field.name] = 'Enter a valid phone number.';
        }
        if (field.kind === 'age') {
            const n = Number(raw);
            if (!Number.isInteger(n) || n < 16 || n > 60) {
                errors[field.name] = 'Enter an age between 16 and 60.';
            }
        }
    }

    // "Other" choices need their free-text companion filled in.
    for (const field of FIELDS) {
        if (!field.otherField) continue;
        if ((values[field.name] ?? '').trim() !== 'Other') continue;
        if (!(values[field.otherField] ?? '').trim()) {
            errors[field.otherField] = `Please specify — ${field.label}`;
        }
    }

    return errors;
}

function renderEmail(values: Record<string, string>, tier: typeof TIERS[number], id: string, photoUrl: string | null) {
    const rows = FIELDS
        .filter((f) => (values[f.name] ?? '').trim())
        .map((f) => `
            <tr>
              <td style="padding:8px 14px;border-bottom:1px solid #eee;vertical-align:top;width:38%;color:#666;font-size:13px;">${esc(f.label)}</td>
              <td style="padding:8px 14px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px;white-space:pre-wrap;">${esc(values[f.name])}</td>
            </tr>`)
        .join('');

    return `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="margin:0 0 4px;font-size:20px;">New registration — ${esc(values.fullName)}</h2>
      <p style="margin:0 0 20px;color:#666;font-size:13px;">
        ${esc(tier.label)} · ${tier.ghs} GH&#8373; / $${tier.usd} · ref <code>${esc(id)}</code>
      </p>
      <table style="border-collapse:collapse;width:100%;">${rows}</table>
      <p style="margin:24px 0 0;font-size:14px;">
        ${photoUrl
            ? `<a href="${esc(photoUrl)}" style="color:#2a7;">View submitted photo</a> <span style="color:#999;">(link expires in 30 days — the photo stays in Supabase Storage)</span>`
            : `<span style="color:#999;">Photo uploaded, but the preview link could not be generated. Find it in Supabase Storage.</span>`}
      </p>
    </div>`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return json({ error: 'Expected multipart/form-data.' }, 400);
    }

    const values: Record<string, string> = {};
    for (const field of FIELDS) {
        const v = form.get(field.name);
        values[field.name] = typeof v === 'string' ? v.trim() : '';
    }

    const errors = validate(values);

    const photo = form.get('photo');
    if (!(photo instanceof File) || photo.size === 0) {
        errors.photo = 'A photo of yourself is required.';
    } else if (photo.size > MAX_PHOTO_BYTES) {
        errors.photo = 'Photo must be 10 MB or smaller.';
    } else if (!ALLOWED_PHOTO_TYPES.includes(photo.type)) {
        errors.photo = 'Photo must be a JPG, PNG, WEBP or HEIC image.';
    }

    if (Object.keys(errors).length) return json({ errors }, 400);

    // Resolved from the server clock so the fee can't be changed client-side.
    const tier = resolveTier(new Date());
    if (!tier) return json({ error: 'Registration is not open at the moment.' }, 409);

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Upload first so a failed upload doesn't leave a row pointing at nothing.
    const file = photo as File;
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const photoPath = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(photoPath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
        console.error('photo upload failed', uploadError);
        return json({ error: 'Could not upload your photo. Please try again.' }, 500);
    }

    const row: Record<string, unknown> = { photo_path: photoPath, tier: tier.id, fee_ghs: tier.ghs };
    for (const field of FIELDS) row[field.column] = values[field.name] || null;
    row.age = Number(values.age);

    const { data, error } = await supabase
        .from('registrations')
        .insert(row)
        .select('id')
        .single();

    if (error) {
        // Don't leave the orphaned photo behind.
        await supabase.storage.from(BUCKET).remove([photoPath]);

        if (error.code === '23505') {
            return json({ error: 'A registration already exists for that email address.' }, 409);
        }
        console.error('insert failed', error);
        return json({ error: 'Could not save your registration. Please try again.' }, 500);
    }

    // Notification is best-effort: the registration is already safely stored, so a
    // mail failure must not tell the applicant their submission failed.
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
        // Expected before Resend is set up. The registration is saved either way —
        // read submissions in the Supabase dashboard until notifications are wired.
        console.log(`registration ${data.id} saved; RESEND_API_KEY unset, no email sent`);
        return json({ ok: true, id: data.id });
    }

    try {
        const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(photoPath, 60 * 60 * 24 * 30);

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: Deno.env.get('MAIL_FROM') ?? 'Miss Eco Ghana <onboarding@resend.dev>',
                to: NOTIFY_EMAIL,
                reply_to: values.email,
                subject: `New registration — ${values.fullName} (${tier.label})`,
                html: renderEmail(values, tier, data.id, signed?.signedUrl ?? null),
            }),
        });
        if (!res.ok) console.error('resend rejected the send', res.status, await res.text());
    } catch (e) {
        console.error('resend threw', e);
    }

    return json({ ok: true, id: data.id });
});
