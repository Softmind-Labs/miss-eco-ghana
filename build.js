// build.js — assembles index.html from src/ components
// Usage: node build.js
// No npm dependencies required.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'index.html');

// ─── Data builders ───────────────────────────────────────────────────────────

function buildContestants() {
    const data = JSON.parse(fs.readFileSync(path.join(SRC, 'data/contestants.json'), 'utf8'));
    const items = data.map(c => `            <div role="listitem" class="w-dyn-item">
                <div data-w-id="7ebc8700-cabb-b5f8-5b01-3768540ef8fb" style="opacity:0" class="speaker-card">
                    <img loading="lazy" src="${c.image}" alt="Image" sizes="(max-width: 767px) 100vw, (max-width: 991px) 726.625px, 939.15625px" class="speaker-image _1"/>
                    <div class="speaker-bottom-block">
                        <div class="speaker-text-block">
                            <h2 class="speaker-name _1">${c.name}</h2>
                        </div>
                    </div>
                </div>
            </div>`).join('\n');
    return `        <section class="speakers-section-01 section-padding-top">
            <div class="w-layout-blockcontainer container w-container">
                <div class="section-wrap">
                    <div class="section-title-wrap">
                        <h2 data-w-id="c012700a-d715-3d9a-8905-1fd84140f3f0" style="opacity:0" class="section-title">
                            Meet our <span class="section-title-span">Contestants</span>
                        </h2>
                    </div>
                    <div class="w-dyn-list">
                        <div role="list" class="speaker-collection-list _2 w-dyn-items">
${items}
                        </div>
                    </div>
                </div>

            </div>
        </section>`;
}

function buildSchedule() {
    const data = JSON.parse(fs.readFileSync(path.join(SRC, 'data/schedule.json'), 'utf8'));
    const items = data.map(s => `                                <div data-w-id="5bf6c25c-c85e-42d7-4583-b3d79fd2d881" style="opacity:0" role="listitem" class="w-dyn-item">
                                    <div class="schedule-item style-1">
                                        <div class="schedule-content-block style-1">
                                            <h3 class="schedule-title small">${s.title}</h3>
                                            <div class="schedule-time-wrap">
                                                <div class="schedule-time">${s.date}</div>
                                            </div>
                                        </div>
                                        <div class="schedule-speaker-block">
                                            <p class="speaker-statement">${s.description}</p>
                                        </div>
                                    </div>
                                </div>`).join('\n');
    return `        <section class="schedule-section section-padding-top" id="schedule">
            <div class="w-layout-blockcontainer container w-container">
                <div class="schedule-wrap-1">
                    <div class="schedule-left-block">
                        <h2 data-w-id="9e7d3fa0-d91d-69b4-433f-33f67ad1858a" style="opacity:0" class="section-title">Featured Sessions</h2>
                        <div data-w-id="9e7d3fa0-d91d-69b4-433f-33f67ad1858e" style="opacity:0">
                            <a data-w-id="93c66a6a-1b83-c49f-beb1-6159e9c7f343" href="/schedule" class="button style-3 w-inline-block">
                                <div class="button-area">
                                    <div class="button-text">Full Schedule</div>
                                    <div class="button-icon-wrapper">
                                        <img loading="lazy" src="https://cdn.prod.website-files.com/6868cd37a164c17aef4e0971/6868cd37a164c17aef4e0d62_dot-icon.svg" alt="" class="button-icon"/>
                                        <img loading="lazy" src="https://cdn.prod.website-files.com/6868cd37a164c17aef4e0971/6868cd37a164c17aef4e0d62_dot-icon.svg" alt="" class="button-icon-normal"/>
                                        <img loading="lazy" src="https://cdn.prod.website-files.com/6868cd37a164c17aef4e0971/6868cd37a164c17aef4e0d62_dot-icon.svg" alt="" class="button-icon-hover"/>
                                    </div>
                                </div>
                            </a>
                        </div>
                    </div>
                    <div class="schedule-right-block">
                        <div class="w-dyn-list">
                            <div role="list" class="schedule-collection-list style-1 w-dyn-items">
${items}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>`;
}

function buildFaqs() {
    const data = JSON.parse(fs.readFileSync(path.join(SRC, 'data/faqs.json'), 'utf8'));
    const lottieAttrs = `data-is-ix2-target="1" class="faq-icon" data-w-id="ae70eff3-e8c8-8d75-2d4b-e103a803edca" data-animation-type="lottie" data-src="https://cdn.prod.website-files.com/6868cd37a164c17aef4e0971/6868cd37a164c17aef4e0d3b_plus-minus.json" data-loop="0" data-direction="1" data-autoplay="0" data-renderer="svg" data-default-duration="0" data-duration="0.5"`;
    const items = data.map(f => `                        <div data-delay="0" data-hover="false" data-w-id="ae70eff3-e8c8-8d75-2d4b-e103a803edc5" class="faq-item w-dropdown">
                            <div class="faq-header w-dropdown-toggle">
                                <p class="faq-question">${f.question}</p>
                                <div class="faq-item-icon">
                                    <div ${lottieAttrs}></div>
                                </div>
                            </div>
                            <nav class="faq-item-content w-dropdown-list">
                                <p class="faq-item-content-p">${f.answer}</p>
                            </nav>
                        </div>`).join('\n');
    return `        <section class="faq-section section-padding" id="faqs">
            <div class="w-layout-blockcontainer container w-container">
                <div class="faq-wrap-2">
                    <div class="section-title-wrap faq">
                        <h2 data-w-id="61bfa1fb-6194-5d54-5a04-1e13938c8edb" class="section-title">Frequently Asked Questions</h2>
                    </div>
                    <div data-w-id="61bfa1fb-6194-5d54-5a04-1e13938c8edd" class="faq-list-wrapper _1">
${items}
                    </div>
                </div>
            </div>
        </section>`;
}

function buildRegistration() {
    const data = JSON.parse(fs.readFileSync(path.join(SRC, 'data/registration.json'), 'utf8'));

    const label = f => `${f.label}${f.required ? ' <span class="reg-required">*</span>' : ''}`;

    const control = f => {
        if (f.type === 'textarea') {
            return `<textarea id="reg-${f.name}" name="${f.name}" rows="${f.rows || 4}" class="reg-input reg-textarea"${f.required ? ' required' : ''}></textarea>`;
        }
        if (f.type === 'file') {
            return `<input type="file" id="reg-${f.name}" name="${f.name}" accept="${f.accept}" class="reg-input reg-file"${f.required ? ' required' : ''}/>
                                    <p class="reg-hint">${f.hint}</p>`;
        }
        if (f.type === 'radio') {
            const opts = f.choices.map(c => `                                        <label class="reg-choice">
                                            <input type="radio" name="${f.name}" value="${c}"${f.required ? ' required' : ''}/>
                                            <span>${c}</span>
                                        </label>`).join('\n');
            // "Other" reveals a companion text box; registration.js toggles it.
            const other = f.other ? `
                                    <input type="text" name="${f.name}Other" class="reg-input reg-other" data-reg-other-for="${f.name}" placeholder="Please specify" hidden/>` : '';
            return `<div class="reg-choices" role="radiogroup" aria-labelledby="reg-${f.name}-label">
${opts}
                                    </div>${other}`;
        }
        const attrs = [
            `type="${f.type}"`,
            `id="reg-${f.name}"`,
            `name="${f.name}"`,
            'class="reg-input"',
            f.required ? 'required' : '',
            f.autocomplete ? `autocomplete="${f.autocomplete}"` : '',
            f.placeholder ? `placeholder="${f.placeholder}"` : '',
            f.min !== undefined ? `min="${f.min}"` : '',
            f.max !== undefined ? `max="${f.max}"` : '',
        ].filter(Boolean).join(' ');
        return `<input ${attrs}/>`;
    };

    const fields = data.fields.map(f => `                            <div class="reg-field" data-reg-field="${f.name}">
                                <span class="reg-label" id="reg-${f.name}-label">${label(f)}</span>
                                <div class="reg-control">
                                    ${control(f)}
                                </div>
                                <p class="reg-error" data-reg-error-for="${f.name}" hidden></p>
                            </div>`).join('\n');

    return `        <section class="why-choose-us-section section-padding-top" id="register-form">
            <div class="w-layout-blockcontainer container w-container">
                <div class="section-wrap">
                    <div class="section-title-wrap">
                        <h2 class="section-title">
                            Enter <span class="section-title-span">Miss Eco Ghana</span>
                        </h2>
                    </div>

                    <div class="reg-status" data-reg-status>
                        <p class="reg-status-line" data-reg-window>Loading registration details&hellip;</p>
                        <noscript>
                            <p class="reg-status-line">This form needs JavaScript. Please enable it, or email <a href="mailto:globalelegancepageantsghana@gmail.com">globalelegancepageantsghana@gmail.com</a> to register.</p>
                        </noscript>
                    </div>

                    <form class="reg-form" data-reg-form novalidate hidden>
${fields}
                        <div class="reg-submit-row">
                            <button type="submit" class="reg-submit" data-reg-submit>Submit registration</button>
                            <p class="reg-form-error" data-reg-form-error hidden></p>
                        </div>
                    </form>

                    <div class="reg-success" data-reg-success hidden>
                        <h3 class="reg-success-title">Registration received</h3>
                        <p class="reg-success-body">Thank you for entering Miss Eco Ghana. Our team will be in touch by email with your screening details.</p>
                    </div>
                </div>
            </div>
        </section>`;
}

// Homepage teaser. Phrased as fixed windows rather than "opens in N days" so it
// stays accurate whenever it's read — registration.js only runs on register.html.
function buildRegistrationSummary() {
    const data = JSON.parse(fs.readFileSync(path.join(SRC, 'data/registration.json'), 'utf8'));
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const pretty = iso => {
        const p = iso.split('-');
        return `${Number(p[2])} ${MONTHS[Number(p[1]) - 1]}`;
    };
    const parts = data.tiers.map(t =>
        `${t.ghs} GH&#8373; / $${t.usd} from ${pretty(t.start)} to ${pretty(t.end)}`);
    return `                        <p class="reg-cta-note">${parts.join(' &middot; ')}</p>`;
}

function buildRegistrationConfig() {
    const data = JSON.parse(fs.readFileSync(path.join(SRC, 'data/registration.json'), 'utf8'));
    // Only the values the browser legitimately needs — no secrets live in this file.
    const cfg = {
        functionUrl: data.functionUrl,
        maxPhotoBytes: data.maxPhotoBytes,
        tiers: data.tiers,
        fields: data.fields.map(f => ({
            name: f.name, label: f.label, type: f.type,
            required: !!f.required, other: !!f.other,
        })),
    };
    return `        <script>window.MEG_REGISTRATION = ${JSON.stringify(cfg)};</script>`;
}

// ─── Assembler ────────────────────────────────────────────────────────────────

// `home` is the prefix that makes shared components' in-page anchors resolve
// correctly per page: '' on the homepage (#faqs), 'index.html' elsewhere
// (index.html#faqs). Lets one header.html serve every page without forking it.
function build(shellFile, outFile, { home }) {
    let html = fs.readFileSync(path.join(SRC, shellFile), 'utf8');

    // Replace <!-- INCLUDE:path:style --> with <style>file contents</style>
    html = html.replace(/<!-- INCLUDE:([^:]+):style -->/g, (_, filePath) => {
        const content = fs.readFileSync(path.join(SRC, filePath), 'utf8');
        return `<style>\n${content}\n        </style>`;
    });

    // Replace <!-- INCLUDE:path:script --> with <script>file contents</script>
    // Must run before the bare INCLUDE pass below, same as the :style pass above.
    html = html.replace(/<!-- INCLUDE:([^:]+):script -->/g, (_, filePath) => {
        const content = fs.readFileSync(path.join(SRC, filePath), 'utf8');
        return `<script>\n${content}\n        </script>`;
    });

    // Replace <!-- INCLUDE:path --> with file contents
    html = html.replace(/<!-- INCLUDE:([^ ]+) -->/g, (_, filePath) => {
        return fs.readFileSync(path.join(SRC, filePath), 'utf8');
    });

    // Replace <!-- DATA:xxx --> with generated HTML
    html = html.replace(/<!-- DATA:contestants -->/g, buildContestants());
    html = html.replace(/<!-- DATA:schedule -->/g, buildSchedule());
    html = html.replace(/<!-- DATA:faqs -->/g, buildFaqs());
    html = html.replace(/<!-- DATA:registration-form -->/g, buildRegistration());
    html = html.replace(/<!-- DATA:registration-summary -->/g, buildRegistrationSummary());
    html = html.replace(/<!-- DATA:registration-config -->/g, buildRegistrationConfig());

    // Must run last — components carry {{HOME}} in their hrefs.
    html = html.replace(/\{\{HOME\}\}/g, home);

    const out = path.join(__dirname, outFile);
    fs.writeFileSync(out, html, 'utf8');
    console.log(`Built ${out}`);
}

build('shell.html', 'index.html', { home: '' });
build('shell-register.html', 'register.html', { home: 'index.html' });
