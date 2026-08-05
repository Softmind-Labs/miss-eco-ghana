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
import { cors, esc, json, resolveTier, TIERS, type Tier } from '../_shared/config.ts';
import { layout, row, send } from '../_shared/notify.ts';
import { initiateCheckout, newClientReference } from '../_shared/hubtel.ts';

// ─── Config ──────────────────────────────────────────────────────────────────

const BUCKET = 'registration-photos';
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB, matching the form
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

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
// cors, json, esc and resolveTier now live in ../_shared/config.ts so the
// callback function uses the identical tier table. Change fees in ONE place.

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

function renderEmail(values: Record<string, string>, tier: Tier, id: string, photoUrl: string | null) {
    const rows = FIELDS
        .filter((f) => (values[f.name] ?? '').trim())
        .map((f) => row(f.label, values[f.name]))
        .join('');

    return layout(
        `New application — ${values.fullName}`,
        `${esc(tier.label)} · ${tier.ghs} GH&#8373; owed · <strong style="color:#c0392b;">UNPAID</strong> · ref <code>${esc(id)}</code>`,
        `<table style="border-collapse:collapse;width:100%;">${rows}</table>
         <p style="margin:24px 0 0;font-size:14px;">
           ${photoUrl
            ? `<a href="${esc(photoUrl)}" style="color:#2a7;">View submitted photo</a> <span style="color:#999;">(link expires in 30 days — the photo stays in Supabase Storage)</span>`
            : `<span style="color:#999;">Photo uploaded, but the preview link could not be generated. Find it in Supabase Storage.</span>`}
         </p>`,
    );
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
    //
    // Test bypass: lets us exercise the full path (DB, storage, Hubtel, email)
    // outside the registration window WITHOUT opening the form to the public.
    // Inert unless TEST_BYPASS_TOKEN is set as a secret, and the caller must send
    // the matching header. Unset the secret when you're done testing:
    //     npx supabase secrets unset TEST_BYPASS_TOKEN
    const bypassToken = Deno.env.get('TEST_BYPASS_TOKEN');
    const bypassed = !!bypassToken && req.headers.get('x-test-bypass') === bypassToken;

    let tier = resolveTier(new Date());
    if (!tier && bypassed) {
        tier = TIERS[0]; // price the test at the early-bird rate
        console.warn('TEST BYPASS USED — tier gate skipped for this request');
    }
    if (!tier) return json({ error: 'Registration is not open at the moment.' }, 409);

    // Test-only amount override, e.g. charge 1 GHS instead of 200 while testing:
    //     npx supabase secrets set TEST_AMOUNT_GHS=1
    //     npx supabase secrets unset TEST_AMOUNT_GHS      <-- REMEMBER THIS
    //
    // This deliberately overrides BOTH the amount sent to Hubtel and the fee_ghs
    // stored on the row. They must move together: the callback settles only if the
    // payment covers the stored fee, so charging 1 while storing 200 would make
    // every test payment look like an underpayment and never settle.
    const override = Number(Deno.env.get('TEST_AMOUNT_GHS') ?? '');
    const chargeGhs = Number.isFinite(override) && override > 0 ? override : tier.ghs;
    if (chargeGhs !== tier.ghs) {
        console.warn(`TEST_AMOUNT_GHS ACTIVE — charging ${chargeGhs} instead of ${tier.ghs}`);
    }

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

    const clientReference = newClientReference(); // 32 chars — Hubtel's hard limit

    const record: Record<string, unknown> = {
        photo_path: photoPath,
        tier: tier.id,
        fee_ghs: chargeGhs,
        client_reference: clientReference,
        payment_status: 'pending',
    };
    for (const field of FIELDS) record[field.column] = values[field.name] || null;
    record.age = Number(values.age);

    // One entry per person — but an abandoned checkout must NOT lock someone out.
    // If a row already exists for this email and it hasn't been paid, we overwrite
    // it with the new answers and issue a fresh checkout. Only a *paid* row blocks.
    const { data: existing } = await supabase
        .from('registrations')
        .select('id, payment_status, photo_path')
        .ilike('email', values.email)
        .maybeSingle();

    let data: { id: string } | null = null;

    if (existing && existing.payment_status === 'paid') {
        await supabase.storage.from(BUCKET).remove([photoPath]);
        return json({ error: 'A paid registration already exists for that email address.' }, 409);
    }

    if (existing) {
        const { data: updated, error: updateError } = await supabase
            .from('registrations')
            .update(record)
            .eq('id', existing.id)
            .select('id')
            .single();

        if (updateError) {
            await supabase.storage.from(BUCKET).remove([photoPath]);
            console.error('update failed', updateError);
            return json({ error: 'Could not save your registration. Please try again.' }, 500);
        }
        data = updated;
        // The replaced photo is now unreferenced.
        if (existing.photo_path) {
            await supabase.storage.from(BUCKET).remove([existing.photo_path]);
        }
    } else {
        const { data: inserted, error } = await supabase
            .from('registrations')
            .insert(record)
            .select('id')
            .single();

        if (error) {
            await supabase.storage.from(BUCKET).remove([photoPath]); // no orphan photos
            if (error.code === '23505') {
                return json({ error: 'A registration already exists for that email address.' }, 409);
            }
            console.error('insert failed', error);
            return json({ error: 'Could not save your registration. Please try again.' }, 500);
        }
        data = inserted;
    }

    const id = data!.id;

    // ── Notify the team that an application arrived, unpaid ──────────────────
    // Best-effort: the row is already stored, so a mail failure must never tell
    // the applicant their submission failed.
    const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(photoPath, 60 * 60 * 24 * 30);

    await send(
        `New application (UNPAID) — ${values.fullName} (${tier.label})`,
        renderEmail(values, tier, id, signed?.signedUrl ?? null),
        values.email,
    );

    // ── Start the payment ────────────────────────────────────────────────────
    // A checkout failure is NOT a registration failure. The application is saved;
    // the client shows a "we'll be in touch about payment" state instead.
    const checkout = await initiateCheckout({
        amountGhs: chargeGhs,
        description: `Miss Eco Ghana registration ${values.fullName}`,
        clientReference,
        payeeName: values.fullName,
        payeeEmail: values.email,
        payeeMobileNumber: values.phone,
    });

    if (!checkout) {
        console.error(`registration ${id} saved but checkout could not be created`);
        return json({ ok: true, id, checkoutUrl: null });
    }

    return json({ ok: true, id, checkoutUrl: checkout.checkoutUrl });
});
