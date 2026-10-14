'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const labels = {
    reported: 'A summary of your example answers',
    observation: 'Direct observations from your example answers',
    hypothesis: 'Possible interpretation · not an established conclusion',
    recommendation: 'A suggestion to explore · not a promised outcome',
    unknown: 'Questions we are keeping open'
  };
  const chevron = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg>';
  let data;
  let answers = new Map();
  let current = 0;
  let chapterAnimation = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function quote(answer) {
    const figure = element('figure', 'answer-quote');
    figure.append(element('blockquote', '', `“${answer.text}”`));
    figure.append(element('figcaption', '', `${data.persona.name}’s fictional answer · ${answer.question}`));
    return figure;
  }

  function evidence(section) {
    if (!section.evidence.length) return null;
    const details = element('details', 'evidence');
    const summary = element('summary', '', 'Why this appears');
    summary.insertAdjacentHTML('beforeend', chevron);
    const content = element('div', 'evidence-content');
    section.evidence.forEach((id) => {
      if (answers.has(id)) content.append(quote(answers.get(id)));
    });
    const explanation = section.kind === 'hypothesis'
      ? 'These words suggest a possibility to explore. They do not establish the cause, a diagnosis or a fixed personality type.'
      : section.kind === 'recommendation'
        ? 'This suggestion connects to the preferences and available time in these example answers. It has not been tried or proven to work.'
        : section.kind === 'unknown'
          ? 'These answers leave room for more understanding. No answer is assumed where something is still unknown.'
          : 'These are fictional source answers for this design study. They support the observations shown; they do not tell us more than the person shared.';
    content.append(element('p', 'evidence-explanation', explanation));
    details.append(summary, content);
    return details;
  }

  function splitFirstSentence(text) {
    const index = text.indexOf('. ');
    return index < 0 ? [text, ''] : [text.slice(0, index + 1), text.slice(index + 2)];
  }

  function appendBullets(container, section) {
    if (!section.bullets?.length) return;
    if (section.id === 'A') {
      section.bullets.forEach((text) => container.append(element('p', 'emphasis-line', text)));
      return;
    }
    if (section.id === 'B') {
      section.bullets.forEach((text) => {
        const [heading, body] = splitFirstSentence(text);
        const block = element('div', 'reflection-block');
        block.append(element('h2', '', heading), element('p', '', body));
        container.append(block);
      });
      return;
    }
    if (section.id === 'D') {
      section.bullets.forEach((text) => container.append(element('p', 'uncertainty-note', text)));
      return;
    }
    if (section.id === 'G') {
      section.bullets.forEach((text) => {
        const block = element('div', 'ifthen');
        const p = element('p');
        const position = text.indexOf(', then ');
        if (position >= 0) {
          p.append(element('strong', '', text.slice(0, position + 1)), document.createTextNode(text.slice(position + 1)));
        } else p.textContent = text;
        block.append(p);
        container.append(block);
      });
      return;
    }
    if (section.id === 'H') {
      const sequence = element('div', 'week-sequence');
      section.bullets.forEach((text) => {
        const separator = text.indexOf(' — ');
        const label = separator < 0 ? '' : text.slice(0, separator);
        const rest = separator < 0 ? text : text.slice(separator + 3);
        const [title, body] = splitFirstSentence(rest);
        const row = element('div', 'day-row');
        const description = element('div');
        description.append(element('h2', '', title), element('p', '', body));
        row.append(element('span', 'day', label), description);
        sequence.append(row);
      });
      container.append(sequence);
      return;
    }
    const list = element(section.id === 'F' ? 'ol' : 'ul', section.id === 'F' ? 'steps-list' : 'questions-list');
    section.bullets.forEach((text) => {
      const item = element('li');
      if (section.id === 'F') {
        const [heading, body] = splitFirstSentence(text);
        item.append(element('strong', '', heading), document.createTextNode(body));
      } else item.textContent = text;
      list.append(item);
    });
    container.append(list);
  }

  function chapter(section, forPrint = false) {
    const fragment = document.createDocumentFragment();
    const title = element(forPrint ? 'h2' : 'h1', '', forPrint ? `${section.id}. ${section.title}` : section.title);
    if (!forPrint) { title.id = 'chapter-title'; title.tabIndex = -1; }
    fragment.append(title);
    if (section.id === 'A') fragment.append(element('p', 'opening-thought', data.heroTitle));
    fragment.append(element('p', `classification ${section.kind}`, labels[section.kind] || 'From this example'));
    if (section.id === 'C') {
      fragment.append(element('h2', '', 'You told us…'));
      fragment.append(quote(answers.get('Q2')));
      fragment.append(element('h2', '', 'One possibility to explore…'));
    }
    fragment.append(element('p', 'lead', section.body));
    appendBullets(fragment, section);
    if (section.id === 'A') fragment.append(quote(answers.get('Q1')));
    const sources = evidence(section);
    if (sources) {
      if (forPrint) sources.open = true;
      fragment.append(sources);
    }
    if (section.cta) {
      const preview = element('details', 'next-step-preview');
      preview.append(element('summary', '', section.cta.label), element('p', '', section.cta.demoMessage));
      fragment.append(preview);
      if (!forPrint) {
        const keep = element('a', 'keep-link', 'Download sample PDF');
        keep.href = 'manual.pdf';
        keep.download = 'Manual-of-Me-sample.pdf';
        fragment.append(keep);
      }
    }
    return fragment;
  }

  function buildNavigation() {
    const navigation = byId('chapter-nav');
    const track = byId('chapter-track');
    data.sections.forEach((section, index) => {
      const link = element('a');
      link.href = `#${section.id}`;
      link.setAttribute('aria-label', `Chapter ${section.id}: ${section.title}`);
      link.append(element('span', 'chapter-letter', section.id), element('span', 'chapter-name', section.title));
      link.addEventListener('click', (event) => { event.preventDefault(); navigate(index); });
      navigation.append(link);
      track.append(element('span'));
    });
  }

  function buildPrint() {
    const print = byId('print-document');
    print.append(element('p', 'print-disclaimer', `${data.disclaimer}. Provisional visual identity; no live assessment.`));
    print.append(element('h1', '', data.productTitle));
    print.append(element('p', '', `Prepared for ${data.persona.name} · Guided discovery`));
    print.append(element('p', '', data.heroDescription));
    data.sections.forEach((section) => {
      const page = element('section', 'chapter');
      page.append(chapter(section, true));
      print.append(page);
    });
    print.append(element('p', 'print-disclaimer', 'Independent design study by KOOM. All participant answers are fictional. This example does not process live AI, collect information or book appointments.'));
  }

  function render(index, focus) {
    current = index;
    const section = data.sections[index];
    const target = byId('chapter');
    target.replaceChildren(chapter(section));
    byId('chapter-position').textContent = `Chapter ${section.id} of J · ${index + 1} / ${data.sections.length}`;
    document.title = `${section.title} · Manual of Me`;
    [...byId('chapter-nav').children].forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    [...byId('chapter-track').children].forEach((segment, i) => segment.classList.toggle('current', i === index));
    byId('previous-chapter').disabled = index === 0;
    byId('next-chapter').querySelector('span').textContent = index === data.sections.length - 1 ? 'Back to the beginning' : 'Next chapter';
    byId('next-chapter').setAttribute('aria-label', index === data.sections.length - 1 ? 'Return to chapter A' : `Next: ${data.sections[index + 1].title}`);
    if (focus) {
      byId('chapter-title').focus({ preventScroll: true });
      const area = byId('reading-area');
      if (area.getBoundingClientRect().top < 16 || window.innerWidth < 761) {
        byId('chapter-position').scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
  }

  function navigate(index, updateHistory = true) {
    if (!data || index < 0 || index >= data.sections.length) return;
    chapterAnimation?.cancel();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (updateHistory) history.pushState({ chapter: data.sections[index].id }, '', `#${data.sections[index].id}`);
    render(index, true);
    if (!reduced && typeof byId('chapter').animate === 'function') {
      // One quiet page-turn moment. Content is already visible, never gated behind animation.
      chapterAnimation = byId('chapter').animate([
        { transform: 'translateY(7px)', clipPath: 'inset(0 0 2% 0)' },
        { transform: 'translateY(0)', clipPath: 'inset(0 0 0 0)' }
      ], { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' });
      chapterAnimation.finished.catch(() => {});
    }
  }

  function indexFromHash() {
    const id = location.hash.slice(1).toUpperCase();
    const index = data.sections.findIndex((section) => section.id === id);
    return index >= 0 ? index : 0;
  }

  async function loadReport() {
    try {
      const response = await fetch('./report-data.json');
      if (!response.ok) throw new Error(`Report file returned ${response.status}`);
      data = await response.json();
      if (!data.demo || !data.persona?.answers || data.sections?.length !== 10) throw new Error('Example report is incomplete');
      answers = new Map(data.persona.answers.map((answer) => [answer.id, answer]));
      byId('prepared-for').textContent = `Prepared for ${data.persona.name}`;
      buildNavigation();
      buildPrint();
      render(indexFromHash(), false);
      byId('reading-area').setAttribute('aria-busy', 'false');
      byId('chapter-controls').hidden = false;
      byId('previous-chapter').addEventListener('click', () => navigate(current - 1));
      byId('next-chapter').addEventListener('click', () => navigate((current + 1) % data.sections.length));
      window.addEventListener('popstate', () => render(indexFromHash(), true));
      window.addEventListener('hashchange', () => { if (indexFromHash() !== current) render(indexFromHash(), true); });
    } catch (error) {
      byId('reading-area').setAttribute('aria-busy', 'false');
      byId('chapter-position').textContent = 'The example could not be opened';
      const target = byId('chapter');
      target.classList.add('error-state');
      const retry = element('button', '', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', () => location.reload());
      target.replaceChildren(element('h1', '', 'Let’s try that again.'), element('p', '', 'The sample report did not load. Please retry, or return to the concept collection.'), retry);
    }
  }
  loadReport();
})();
