(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KOOMIntake = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const reviewDate = "2026-10-10";
  const existingReferences = ["SR-1041"];
  const labels = {
    reference: "reference", service: "service", site: "site",
    "requested date": "requestedDate", "time window": "timeWindow",
    contact: "contact", details: "details"
  };
  const required = ["reference", "service", "site", "requestedDate", "timeWindow", "contact"];
  const displayLabels = {
    reference: "Reference", service: "Service", site: "Site",
    requestedDate: "Requested date", timeWindow: "Time window", contact: "Contact", details: "Details"
  };
  const scenarios = [
    {
      id: "ready", name: "Complete request", description: "All required fields supplied",
      text: "Reference: SR-1042\nService: Office cleaning\nSite: North House, Level 2\nRequested date: 2026-10-14\nTime window: 09:00-11:00\nContact: alex@example.com\nDetails: Clean the meeting rooms before the afternoon training session."
    },
    {
      id: "missing", name: "Missing details", description: "Site and time need clarification",
      text: "Reference: SR-1043\nService: Office cleaning\nRequested date: 2026-10-14\nContact: alex@example.com\nDetails: Please arrange a clean before our visitors arrive."
    },
    {
      id: "duplicate", name: "Duplicate reference", description: "Already in the local demo register",
      text: "Reference: SR-1041\nService: Office cleaning\nSite: North House, Level 2\nRequested date: 2026-10-14\nTime window: 09:00-11:00\nContact: alex@example.com\nDetails: Resending the same cleaning request for confirmation."
    }
  ];
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split("-").map(Number);
    if (parts[0] < 1900 || parts[0] > 9999) return false;
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 &&
      date.getUTCDate() === parts[2];
  }
  function validWindow(value) {
    const match = /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/.exec(value);
    if (!match) return false;
    const h1 = Number(match[1]), m1 = Number(match[2]), h2 = Number(match[3]), m2 = Number(match[4]);
    return h1 <= 23 && h2 <= 23 && m1 <= 59 && m2 <= 59 && h2 * 60 + m2 > h1 * 60 + m1;
  }
  function analyze(text, options = {}) {
    const fields = {};
    const errors = [];
    const referenceDate = options.referenceDate || reviewDate;
    const references = options.existingReferences || existingReferences;
    const add = (code, message) => errors.push({ code, message });
    if (typeof text !== "string") return { fields, errors: [{code:"input", message:"Paste a labelled request as text."}], ready:false };
    text.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      const split = line.indexOf(":");
      if (split < 0) { add("unlabelled", "Line " + (index + 1) + " needs a recognised field label."); return; }
      const label = line.slice(0, split).trim().toLowerCase();
      const key = Object.prototype.hasOwnProperty.call(labels, label) ? labels[label] : null;
      if (!key) { add("unknown", "Line " + (index + 1) + " has an unrecognised label; review it manually."); return; }
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        add("repeated", displayLabels[key] + " appears more than once; resolve the conflict."); return;
      }
      fields[key] = line.slice(split + 1).trim();
    });
    required.forEach(key => {
      if (!fields[key]) add("missing:" + key, "Add " + displayLabels[key].toLowerCase() + ".");
    });
    if (fields.reference && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(fields.reference))
      add("reference", "Use a reference of 1-40 letters, numbers, hyphens or underscores.");
    if (fields.reference && references.some(ref => ref.toLowerCase() === fields.reference.toLowerCase()))
      add("duplicate", "Reference " + fields.reference + " already exists in the local demo register.");
    if (fields.requestedDate) {
      if (!validDate(fields.requestedDate)) add("date", "Use a real calendar date in YYYY-MM-DD format.");
      else if (fields.requestedDate < referenceDate) add("past", "Requested date is before the fixed demo review date, " + referenceDate + ".");
    }
    if (fields.timeWindow && !validWindow(fields.timeWindow))
      add("time", "Use a same-day time window such as 09:00-11:00; end must follow start.");
    if (fields.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contact))
      add("contact", "Supply one contact email address. This check does not verify delivery.");
    return { fields, errors, ready: errors.length === 0 };
  }
  function prepareDraft(analysis, reviewed) {
    if (!reviewed) throw new Error("Manual review is required.");
    if (!analysis || !analysis.ready || analysis.errors.length) throw new Error("Resolve every exception before preparing a draft.");
    return {
      type: "neutral_job_draft",
      status: "manually_reviewed_local_demo",
      ...analysis.fields,
      liveConnection: false
    };
  }
  return { analyze, prepareDraft, scenarios, reviewDate, existingReferences, validDate };
});

