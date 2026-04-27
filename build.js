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
    return `        <section class="schedule-section section-padding-top">
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
    return `        <section class="faq-section section-padding">
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

// ─── Assembler ────────────────────────────────────────────────────────────────

function build() {
    let html = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');

    // Replace <!-- INCLUDE:path:style --> with <style>file contents</style>
    html = html.replace(/<!-- INCLUDE:([^:]+):style -->/g, (_, filePath) => {
        const content = fs.readFileSync(path.join(SRC, filePath), 'utf8');
        return `<style>\n${content}\n        </style>`;
    });

    // Replace <!-- INCLUDE:path --> with file contents
    html = html.replace(/<!-- INCLUDE:([^ ]+) -->/g, (_, filePath) => {
        return fs.readFileSync(path.join(SRC, filePath), 'utf8');
    });

    // Replace <!-- DATA:xxx --> with generated HTML
    html = html.replace(/<!-- DATA:contestants -->/g, buildContestants());
    html = html.replace(/<!-- DATA:schedule -->/g, buildSchedule());
    html = html.replace(/<!-- DATA:faqs -->/g, buildFaqs());

    fs.writeFileSync(OUT, html, 'utf8');
    console.log(`Built ${OUT}`);
}

build();
