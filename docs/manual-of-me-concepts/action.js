(() => {
  "use strict";
  const key = "koom-manual-of-me-fictional-sam-journal-v1";
  const labels = { reported: "From the sample answers", observation: "Observation supported by answers", hypothesis: "Possible explanation — not established", recommendation: "Suggested experiment — not an outcome", unknown: "Still unknown" };
  let report, answers, sections, mode = "steady", stored = true;
  let checked = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    checked = Array.isArray(saved) ? saved.filter(value => Number.isInteger(value) && value >= 0 && value < 7) : [];
  } catch { stored = false; }

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const evidence = (ids, label = "See the answers behind this") => {
    if (!ids?.length) return null;
    const detail = element("details", "evidence");
    detail.append(element("summary", "", label));
    ids.forEach(id => {
      const answer = answers.get(id);
      if (!answer) return;
      const quote = element("blockquote", "evidence-quote");
      quote.append(element("p", "", `“${answer.text}”`), element("cite", "", `${id} · ${answer.question}`));
      detail.append(quote);
    });
    return detail;
  };
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify(checked)); }
    catch { stored = false; }
    updateStatus();
  };
  const updateStatus = () => {
    document.getElementById("checklist-status").textContent = `${checked.length} of 7 days marked as tried`;
    document.getElementById("reset-marks").disabled = checked.length === 0;
    document.getElementById("storage-note").textContent = stored
      ? "Sample checklist, not recorded participant progress. Your marks stay in this browser and are never sent to a server."
      : "Browser storage is unavailable. These sample marks last only while this page stays open; nothing is sent to a server.";
  };

  function renderWeek() {
    const plan = sections.get("H").plan;
    const rules = sections.get("G").bullets;
    const days = [
      { name: "Monday", plan: 0 },
      { name: "Tuesday", plan: 1 },
      { name: "Wednesday", plan: 1, continuation: true },
      { name: "Thursday", plan: 2 },
      { name: "Friday", plan: 3 },
      { name: "Saturday", plan: 3, continuation: true },
      { name: "Sunday", plan: 4 }
    ];
    const fragment = document.createDocumentFragment();
    days.forEach((day, index) => {
      const source = plan[day.plan];
      const row = element("article", `day${checked.includes(index) ? " is-marked" : ""}`);
      const top = element("div", "day-top");
      top.append(element("span", "day-name", day.name), element("span", "day-index", String(index + 1).padStart(2, "0")));
      let title = source.title;
      let text = source.text;
      if (day.continuation) {
        title = "Room to move";
        text = `This shares the ${day.plan === 1 ? "first" : "second"} walking window with the day before. Use it if that timing fits better; no extra walk is added.`;
      }
      if (mode === "small" && [1, 2, 4, 5].includes(index)) {
        title = day.continuation ? "Keep a way back" : "Use your backup";
        text = index < 3 ? rules[1] : rules[2];
      }
      row.append(top, element("h3", "", title), element("p", "", text));
      const checkLabel = element("label", "day-check");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = checked.includes(index);
      check.setAttribute("aria-label", `Mark ${day.name}, day ${index + 1}, as tried in this sample checklist`);
      check.addEventListener("change", () => {
        checked = check.checked ? [...new Set([...checked, index])] : checked.filter(value => value !== index);
        row.classList.toggle("is-marked", check.checked);
        persist();
      });
      checkLabel.append(check, element("span", "", "I tried this day"));
      row.append(checkLabel);
      fragment.append(row);
    });
    document.getElementById("week-days").replaceChildren(fragment);
    document.getElementById("planning-note").textContent = mode === "small"
      ? "Fallback prompts use the same draft if-then rules below. The aim stays two short walks; changing timing does not add another task."
      : "Weekdays are illustrative: start on any day. Tuesday–Wednesday share one walking window; Friday–Saturday share the other. Two walks, not four.";
    updateStatus();
  }

  function renderAlternatives() {
    const list = document.getElementById("if-then-rules");
    sections.get("G").bullets.forEach(rule => {
      const separator = rule.indexOf(", then ");
      const row = element("div", "rule");
      row.append(element("span", "rule-word", "If"));
      const words = element("div", "");
      if (separator !== -1) {
        const condition = rule.slice(3, separator);
        const result = rule.slice(separator + 7);
        words.append(element("p", "", condition));
        const response = element("p", "");
        response.append(element("b", "", "Then "), document.createTextNode(result));
        words.append(response);
      } else words.append(element("p", "", rule));
      row.append(words);
      list.append(row);
    });
  }

  function renderSections() {
    const list = document.getElementById("section-list");
    report.sections.forEach(section => {
      const detail = element("details", "report-section");
      detail.id = `section-${section.id}`;
      const summary = element("summary", "");
      summary.append(element("span", "section-letter", section.id), element("h3", "", section.title), element("span", "details-icon"));
      summary.lastChild.setAttribute("aria-hidden", "true");
      const body = element("div", "section-content");
      body.append(element("p", "finding-type", labels[section.kind] || section.kind), element("p", "", section.body));
      if (section.id === "B" && section.items?.length) {
        section.items.forEach(item => {
          const finding = element("div", "finding");
          finding.append(element("h4", "", item.title), element("p", "", item.text));
          const source = evidence(item.evidence);
          if (source) finding.append(source);
          body.append(finding);
        });
      } else if (section.bullets?.length) {
        const bullets = element(section.id === "F" ? "ol" : "ul", "");
        section.bullets.forEach(text => bullets.append(element("li", "", text)));
        body.append(bullets);
      }
      if (section.id !== "B") {
        const source = evidence(section.evidence);
        if (source) body.append(source);
      }
      if (section.cta) {
        const button = element("button", "session-preview", section.cta.label);
        button.type = "button";
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "session-preview-note");
        const message = element("p", "session-preview-note", `${section.cta.demoMessage} Your full report and weekly experiment remain available without booking.`);
        message.id = "session-preview-note";
        message.hidden = true;
        button.addEventListener("click", () => {
          message.hidden = !message.hidden;
          button.setAttribute("aria-expanded", String(!message.hidden));
        });
        body.append(button, message);
      }
      detail.append(summary, body);
      list.append(detail);
    });
    list.addEventListener("toggle", () => {
      const allOpen = [...list.querySelectorAll(".report-section")].every(node => node.open);
      const control = document.getElementById("expand-report");
      control.textContent = allOpen ? "Close all sections" : "Open all sections";
      control.setAttribute("aria-expanded", String(allOpen));
    }, true);
    document.getElementById("expand-report").addEventListener("click", () => {
      const nodes = [...list.querySelectorAll(".report-section")];
      const open = !nodes.every(node => node.open);
      nodes.forEach(node => { node.open = open; });
    });
  }

  function renderAnswers() {
    const list = document.getElementById("source-answers");
    report.persona.answers.forEach(answer => {
      const item = element("div", "source-answer");
      item.append(element("h3", "", answer.question), element("blockquote", "", `“${answer.text}”`), element("p", "answer-ref", `${answer.id} · Fictional response`));
      list.append(item);
    });
  }

  async function start() {
    try {
      const response = await fetch("./report-data.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Report unavailable");
      report = await response.json();
      if (!report.demo || report.sections?.length !== 10 || !Array.isArray(report.persona?.answers)) throw new Error("Report format invalid");
      answers = new Map(report.persona.answers.map(answer => [answer.id, answer]));
      sections = new Map(report.sections.map(section => [section.id, section]));
      document.getElementById("personal-intro").textContent = `${report.persona.name}, your aim is a routine that fits busy weeks. Here is a small way to explore that, with room to change the timing.`;
      document.getElementById("experiment-title").textContent = "Two short walks. A little room to learn.";
      document.getElementById("experiment-description").textContent = sections.get("H").body;
      document.getElementById("experiment-why").textContent = sections.get("E").body;
      document.getElementById("experiment-evidence").append(evidence(["Q6", "Q7"], "Read Sam’s own words"));
      document.getElementById("week-review").textContent = sections.get("H").bullets.at(-1).replace(/^Day 7 — Review\.\s*/, "");
      renderWeek();
      renderAlternatives();
      renderSections();
      renderAnswers();
      document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
        mode = button.dataset.mode;
        document.querySelectorAll("[data-mode]").forEach(option => {
          const selected = option === button;
          option.classList.toggle("selected", selected);
          option.setAttribute("aria-pressed", String(selected));
        });
        renderWeek();
      }));
      document.getElementById("reset-marks").addEventListener("click", () => {
        checked = [];
        persist();
        renderWeek();
      });
      document.getElementById("report-content").hidden = false;
      document.documentElement.dataset.reportLoaded = "true";
    } catch {
      document.getElementById("load-error").hidden = false;
      document.getElementById("experiment-description").textContent = "The shared report is unavailable. Reload the page to try again.";
      document.documentElement.dataset.reportLoaded = "false";
    }
  }
  document.getElementById("reload-report").addEventListener("click", () => location.reload());
  start();
})();
