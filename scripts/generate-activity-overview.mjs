import fs from "node:fs";
import path from "node:path";

const token = process.env.GH_TOKEN;
const username = process.env.GITHUB_USERNAME || "erentaymaz";
const outputFile = process.env.OUTPUT_FILE || "assets/activity-overview.svg";

if (!token) {
  throw new Error("GH_TOKEN is missing.");
}

const query = `
query ActivityOverview($login: String!) {
  user(login: $login) {
    login
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
    }
  }
}
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "github-activity-overview-action"
  },
  body: JSON.stringify({
    query,
    variables: { login: username }
  })
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();

if (payload.errors?.length) {
  throw new Error(payload.errors.map(e => e.message).join("; "));
}

const user = payload.data?.user;
if (!user) {
  throw new Error(`GitHub user not found: ${username}`);
}

const c = user.contributionsCollection;

const values = {
  commits: Number(c.totalCommitContributions || 0),
  prs: Number(c.totalPullRequestContributions || 0),
  issues: Number(c.totalIssueContributions || 0),
  reviews: Number(c.totalPullRequestReviewContributions || 0)
};

const total = values.commits + values.prs + values.issues + values.reviews;

function pct(value) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

// Rounding can make the sum differ from 100.
// Adjust the largest category so the displayed percentages always sum to 100.
const percentages = {
  commits: pct(values.commits),
  prs: pct(values.prs),
  issues: pct(values.issues),
  reviews: pct(values.reviews)
};

const sum = Object.values(percentages).reduce((a, b) => a + b, 0);
if (sum !== 100 && total > 0) {
  const largestKey = Object.entries(values).sort((a, b) => b[1] - a[1])[0][0];
  percentages[largestKey] += 100 - sum;
}

const W = 760;
const H = 360;

const cx = 380;
const cy = 182;

// Maximum arm length. Each arm is scaled relative to the largest category.
// A minimum length is used for non-zero values so tiny categories remain visible.
const maxArm = 120;
const minArm = 12;
const maxValue = Math.max(...Object.values(values), 1);

function arm(value) {
  if (value <= 0) return 0;
  return Math.max(minArm, Math.round((value / maxValue) * maxArm));
}

const left = arm(values.commits);
const right = arm(values.issues);
const up = arm(values.reviews);
const down = arm(values.prs);

const theme = {
  bg: "#0d1117",
  border: "#30363d",
  text: "#f0f6fc",
  muted: "#8b949e",
  green: "#3fb950",
  green2: "#56d364",
  grid: "#21262d"
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(username)} GitHub activity overview</title>
  <desc id="desc">Commits ${percentages.commits}%, pull requests ${percentages.prs}%, issues ${percentages.issues}%, code review ${percentages.reviews}%.</desc>

  <rect x="0.5" y="0.5" width="${W-1}" height="${H-1}" rx="8" fill="${theme.bg}" stroke="${theme.border}"/>

  <style>
    .title { font: 600 16px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: ${theme.text}; }
    .label { font: 400 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: ${theme.text}; }
    .muted { font: 400 13px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: ${theme.muted}; }
    .pct { font: 400 13px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: ${theme.muted}; }
    .count { font: 600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; fill: ${theme.muted}; }
  </style>

  <text x="24" y="34" class="title">Activity overview</text>
  <text x="24" y="58" class="muted">Last 12 months · ${esc(username)}</text>

  <!-- subtle guide axes -->
  <line x1="${cx-138}" y1="${cy}" x2="${cx+138}" y2="${cy}" stroke="${theme.grid}" stroke-width="1"/>
  <line x1="${cx}" y1="${cy-112}" x2="${cx}" y2="${cy+112}" stroke="${theme.grid}" stroke-width="1"/>

  <!-- activity arms -->
  <line x1="${cx}" y1="${cy}" x2="${cx-left}" y2="${cy}" stroke="${theme.green2}" stroke-width="3" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy}" x2="${cx+right}" y2="${cy}" stroke="${theme.green2}" stroke-width="3" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy-up}" stroke="${theme.green2}" stroke-width="3" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy+down}" stroke="${theme.green2}" stroke-width="3" stroke-linecap="round"/>

  <!-- arm end points -->
  ${left ? `<circle cx="${cx-left}" cy="${cy}" r="4" fill="${theme.bg}" stroke="${theme.green2}" stroke-width="2"/>` : ""}
  ${right ? `<circle cx="${cx+right}" cy="${cy}" r="4" fill="${theme.bg}" stroke="${theme.green2}" stroke-width="2"/>` : ""}
  ${up ? `<circle cx="${cx}" cy="${cy-up}" r="4" fill="${theme.bg}" stroke="${theme.green2}" stroke-width="2"/>` : ""}
  ${down ? `<circle cx="${cx}" cy="${cy+down}" r="4" fill="${theme.bg}" stroke="${theme.green2}" stroke-width="2"/>` : ""}

  <!-- center -->
  <circle cx="${cx}" cy="${cy}" r="5.5" fill="${theme.bg}" stroke="${theme.green2}" stroke-width="2.5"/>
  <circle cx="${cx}" cy="${cy}" r="2" fill="${theme.green2}"/>

  <!-- labels -->
  <text x="${cx}" y="${cy-132}" text-anchor="middle" class="pct">${percentages.reviews}%</text>
  <text x="${cx}" y="${cy-114}" text-anchor="middle" class="label">Code review</text>
  <text x="${cx}" y="${cy-96}" text-anchor="middle" class="count">${values.reviews} reviews</text>

  <text x="${cx-160}" y="${cy-4}" text-anchor="end" class="pct">${percentages.commits}%</text>
  <text x="${cx-160}" y="${cy+16}" text-anchor="end" class="label">Commits</text>
  <text x="${cx-160}" y="${cy+34}" text-anchor="end" class="count">${values.commits} commits</text>

  <text x="${cx+160}" y="${cy-4}" text-anchor="start" class="pct">${percentages.issues}%</text>
  <text x="${cx+160}" y="${cy+16}" text-anchor="start" class="label">Issues</text>
  <text x="${cx+160}" y="${cy+34}" text-anchor="start" class="count">${values.issues} issues</text>

  <text x="${cx}" y="${cy+132}" text-anchor="middle" class="pct">${percentages.prs}%</text>
  <text x="${cx}" y="${cy+151}" text-anchor="middle" class="label">Pull requests</text>
  <text x="${cx}" y="${cy+170}" text-anchor="middle" class="count">${values.prs} pull requests</text>

  <text x="24" y="${H-24}" class="muted">
    Total tracked activity: ${total}${c.restrictedContributionsCount ? ` · ${c.restrictedContributionsCount} restricted contributions not categorized` : ""}
  </text>
</svg>
`;

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, svg, "utf8");

console.log(`Generated ${outputFile}`);
console.log(values);
console.log(percentages);
