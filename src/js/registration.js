/* Miss Eco Ghana — registration form.
 *
 * Drives three things: which fee tier is showing, inline validation, and the
 * multipart submit to the Supabase Edge Function.
 *
 * No dependencies. jQuery is on the page but it belongs to Webflow's bundle,
 * so this deliberately doesn't touch it.
 */
(function () {
    'use strict';

    var cfg = window.MEG_REGISTRATION;
    if (!cfg) return;

    var form = document.querySelector('[data-reg-form]');
    var windowLine = document.querySelector('[data-reg-window]');
    var successBox = document.querySelector('[data-reg-success]');
    var formError = document.querySelector('[data-reg-form-error]');
    var submitBtn = document.querySelector('[data-reg-submit]');
    if (!form || !windowLine) return;

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    /** "2026-08-15" -> "15 August" (parsed as parts, not Date, to dodge timezone drift). */
    function pretty(iso) {
        var p = iso.split('-');
        return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1];
    }

    function today() {
        var d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    /* ── Which window are we in? ─────────────────────────────────────────────
     * Three states fall out of the same comparison: before the first tier
     * opens, inside a tier, or past the last tier.
     */
    function resolveWindow() {
        var now = today();
        var tiers = cfg.tiers;

        for (var i = 0; i < tiers.length; i++) {
            if (now >= tiers[i].start && now <= tiers[i].end) {
                return { state: 'open', tier: tiers[i] };
            }
        }
        if (now < tiers[0].start) return { state: 'upcoming', tier: tiers[0] };

        // Between two windows (shouldn't happen with contiguous dates, but be safe).
        for (var j = 0; j < tiers.length; j++) {
            if (now < tiers[j].start) return { state: 'upcoming', tier: tiers[j] };
        }
        return { state: 'closed', tier: null };
    }

    /* The form stays on the page in every state, so applicants can read the
     * questions and prepare their answers and photo before entries open. Only
     * submission is gated — and the Edge Function rejects out-of-window posts
     * with a 409 regardless, so this is convenience, not the gate.
     */
    function renderWindow() {
        var w = resolveWindow();
        form.hidden = false;

        if (w.state === 'upcoming') {
            windowLine.innerHTML = 'Registration opens <strong>' + pretty(w.tier.start) +
                '</strong> — ' + w.tier.label + ', ' + w.tier.ghs + ' GH&#8373; / $' + w.tier.usd +
                '. You can read through the questions now.';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Opens ' + pretty(w.tier.start);
            return w;
        }
        if (w.state === 'closed') {
            windowLine.innerHTML = 'Registration is now <strong>closed</strong>. ' +
                'Follow us on social media for news of the next edition.';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Registration closed';
            return w;
        }

        windowLine.innerHTML = '<strong>' + w.tier.label + '</strong> — ' +
            w.tier.ghs + ' GH&#8373; / $' + w.tier.usd +
            '. Closes ' + pretty(w.tier.end) + '.';
        submitBtn.disabled = false;
        return w;
    }

    /* ── "Other" free-text boxes ─────────────────────────────────────────── */

    function wireOtherToggles() {
        var others = form.querySelectorAll('[data-reg-other-for]');
        Array.prototype.forEach.call(others, function (input) {
            var group = input.getAttribute('data-reg-other-for');
            var radios = form.querySelectorAll('input[type="radio"][name="' + group + '"]');

            Array.prototype.forEach.call(radios, function (radio) {
                radio.addEventListener('change', function () {
                    var isOther = radio.checked && radio.value === 'Other';
                    input.hidden = !isOther;
                    if (!isOther) input.value = '';
                    else input.focus();
                });
            });
        });
    }

    /* ── Validation ──────────────────────────────────────────────────────────
     * Mirrors the Edge Function's rules so users get errors without a round
     * trip. The server re-checks everything regardless — this is convenience,
     * not security.
     */

    function valueOf(field) {
        if (field.type === 'radio') {
            var checked = form.querySelector('input[name="' + field.name + '"]:checked');
            return checked ? checked.value : '';
        }
        if (field.type === 'file') {
            var fileInput = form.querySelector('[name="' + field.name + '"]');
            return fileInput && fileInput.files.length ? fileInput.files[0] : null;
        }
        var el = form.querySelector('[name="' + field.name + '"]');
        return el ? el.value.trim() : '';
    }

    function showError(name, message) {
        var el = form.querySelector('[data-reg-error-for="' + name + '"]');
        if (!el) return;
        el.textContent = message || '';
        el.hidden = !message;
        var wrap = form.querySelector('[data-reg-field="' + name + '"]');
        if (wrap) wrap.classList.toggle('reg-field-invalid', !!message);
    }

    function clearErrors() {
        cfg.fields.forEach(function (f) { showError(f.name, ''); });
        formError.hidden = true;
        formError.textContent = '';
    }

    function validate() {
        var errors = [];

        cfg.fields.forEach(function (field) {
            var value = valueOf(field);

            if (field.type === 'file') {
                if (field.required && !value) {
                    errors.push([field.name, 'A photo of yourself is required.']);
                } else if (value && value.size > cfg.maxPhotoBytes) {
                    errors.push([field.name, 'Photo must be 10 MB or smaller.']);
                }
                return;
            }

            if (field.required && !value) {
                errors.push([field.name, field.label + ' is required.']);
                return;
            }
            if (!value) return;

            if (field.name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
                errors.push([field.name, 'Enter a valid email address.']);
            }
            if (field.name === 'phone' && !/^\+?[\d\s()-]{7,}$/.test(value)) {
                errors.push([field.name, 'Enter a valid phone number.']);
            }
            if (field.name === 'age') {
                var n = Number(value);
                if (!/^\d+$/.test(value) || n < 16 || n > 60) {
                    errors.push([field.name, 'Enter an age between 16 and 60.']);
                }
            }
            // "Other" needs its companion box filled in.
            if (field.other && value === 'Other') {
                var other = form.querySelector('[name="' + field.name + 'Other"]');
                if (!other || !other.value.trim()) {
                    errors.push([field.name, 'Please tell us more in the box provided.']);
                }
            }
        });

        return errors;
    }

    /* ── Submit ──────────────────────────────────────────────────────────── */

    function setBusy(busy) {
        submitBtn.disabled = busy;
        submitBtn.textContent = busy ? 'Submitting…' : 'Submit registration';
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        // Pressing Enter in a text field submits even when the button is disabled.
        if (submitBtn.disabled) return;

        clearErrors();

        var errors = validate();
        if (errors.length) {
            errors.forEach(function (pair) { showError(pair[0], pair[1]); });
            var firstField = form.querySelector('[data-reg-field="' + errors[0][0] + '"]');
            if (firstField) firstField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (!cfg.functionUrl || cfg.functionUrl.indexOf('<project-ref>') !== -1) {
            formError.textContent = 'This form is not connected yet. Please contact ' +
                'globalelegancepageantsghana@gmail.com to register.';
            formError.hidden = false;
            return;
        }

        setBusy(true);

        // FormData, not JSON — the headshot is a required field.
        var payload = new FormData(form);

        fetch(cfg.functionUrl, { method: 'POST', body: payload })
            .then(function (res) {
                return res.json().then(function (body) { return { status: res.status, body: body }; });
            })
            .then(function (r) {
                if (r.status === 200 && r.body.ok) {
                    form.hidden = true;
                    successBox.hidden = false;
                    successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }

                // Field-level errors from the server land back on their inputs.
                if (r.body.errors) {
                    Object.keys(r.body.errors).forEach(function (name) {
                        showError(name, r.body.errors[name]);
                    });
                    formError.textContent = 'Please check the highlighted fields.';
                } else {
                    formError.textContent = r.body.error ||
                        'Something went wrong. Please try again.';
                }
                formError.hidden = false;
                setBusy(false);
            })
            .catch(function () {
                formError.textContent = 'We could not reach the server. Check your ' +
                    'connection and try again.';
                formError.hidden = false;
                setBusy(false);
            });
    });

    renderWindow();
    wireOtherToggles();
})();
