# Implementation Plan — Python From Zero: GDGoC AASTMT

## Scope

Build the assessment platform described in the supplied `claude_code_master_prompt.md`: name-only onboarding; three 20-question quizzes spanning the supplied syllabus; a locked Round 2 teaser; a live leaderboard; in-browser Python run/check; first-attempt score protection; and branded local-run documentation. Keep the implementation lightweight and avoid an external database or Docker setup.

## Architecture

- **Web service:** Python FastAPI serving the application and JSON API on one port, with a one-command local start (`uvicorn`). Do not add a container, Dockerfile, or Docker setup; use the managed web preview’s project runtime only.
- **Code execution:** Pyodide loaded into a dedicated Web Worker. Student code never runs in the API process. Add execution time/output limits, capture stdout/stderr, support editor Tab indentation and syntax highlighting, and verify coding tasks with test cases. Multiple-choice and short-answer checks use explicit answer keys. Student-provided `input()` is not used in auto-graded tasks.
- **Question content:** A versioned, structured bank of 60 distinct questions, organized as Quiz 1 (topics 1–6), Quiz 2 (topics 7–13), and Quiz 3 (topics 14–15 plus mixed challenges). Preserve the requested per-quiz difficulty distributions and 1/2/3-point values. Include a mixture of coding, bug-fixing, output-prediction, fill-in, and multiple-choice tasks.
- **Persistence:** Store names, progress, per-quiz attempts/scores, and totals in `leaderboard.json`; serialize updates with a process lock plus an OS file lock and atomic replacement. Use one first completed score per quiz to prevent repeat farming. Explain the policy in the UI.
- **Client state:** Keep the active student's name/session in browser storage. The global board is fetched from the API and shows rank, medal, quiz scores, solved count, and total points.
- **Routes:** Single-page app at `/`, APIs under `/api/`, plus `/manus-routes.json` for the page-route manifest.

## Project Structure

```text
app/
  main.py                 FastAPI routes, API validation, static SPA serving
  storage.py              locked JSON read/update and score policy
  question_bank.py        question schema/loading and validation helpers
  data/questions.json     all 60 question definitions and test cases
  static/
    index.html
    styles.css
    app.js                onboarding, dashboard, quiz flow, leaderboard
    editor.js             editor setup, answer UI and client-side checking
    runner.worker.js      isolated Pyodide execution and output capture
public/manus-routes.json route manifest
leaderboard.json          runtime-created local score store (gitignored)
requirements.txt          pinned Python runtime dependencies
README.md                 setup, run, scoring, and limitations
.gitignore
plan.md
TODO.md                  outcome list after plan approval
```

## Design

- **Design movement:** Google Material / Google Developer aesthetic, directly requested in the brief.
- **Core principles:** Calm focus; clear hierarchy; approachable learning cues; transparent scoring and feedback.
- **Color philosophy:** Off-white and white keep the experience quiet; Google blue anchors actions and progress; red/yellow/green are reserved for difficulty, correctness, and status rather than decoration.
- **Layout paradigm:** A compact top navigation with a broad welcome/dashboard region, a vertical progression path for quizzes, and a dedicated leaderboard panel; question content stays in a spacious reading column with controls close to the task.
- **Signature elements:** Small four-color brand accents; pill-shaped difficulty/point badges; restrained progress indicators and rounded cards.
- **Interaction philosophy:** Immediate, reversible actions; visible run output before submission; explicit confirmation before finalizing a quiz; friendly, specific feedback.
- **Animation:** Brief low-amplitude fades/slides for screen transitions and answer feedback; honor reduced-motion preferences; no looping decorative motion.
- **Typography:** System sans-serif stack for readable UI; monospace stack for code and console; clear size/weight separation for headings, instructions, and metadata.
- **Brand essence:** A friendly, focused Python assessment for GDGoC AASTMT explorers; **clear, welcoming, practical**.
- **Brand voice:** Encouraging and direct. Example: “Hey there, GDGoC AASTMT Explorer! Ready to test your Python skills?” and “Run your code first; submit when you’re happy with it.”
- **Wordmark & logo:** A compact text lockup with a four-color dot mark and “AI Team · GDGoC AASTMT”; no externally sourced logo asset is assumed.
- **Signature brand color:** Google blue `#4285F4`, paired with the user-specified Google accent palette.

## Material Constraints and Honest Limitations

- No GitHub repository was specified in the attached prompt (it contains a placeholder), so this work will be saved to the current managed project repository, not pushed to an invented public repository.
- The requested local JSON file is appropriate for local runs and a single running instance. Managed hosted runtime files may be temporary and may be lost on restarts/redeploys; multiple replicas would not share a local file. The README and UI will disclose that this storage is not a durable production leaderboard. Durable public use would require a later storage decision that relaxes the no-database constraint.
- Browser-side execution isolates student snippets from the API server, but client-side scores cannot provide strong anti-cheat guarantees without trusted server-side execution/authentication. The implementation will enforce the requested first-score rule in the API and make its scope clear.

## Proposed Build Sequence

1. After plan approval, create `TODO.md` with the app outcomes and enable project diagnostics for Python, JavaScript, HTML, CSS, and JSON.
2. Implement FastAPI routes, atomic/locked JSON storage, and the structured question bank.
3. Implement onboarding, dashboard, quiz experience, code editor/worker, feedback, and leaderboard UI.
4. Add route manifest, README, and ignore rules; do not add Docker or container configuration.
5. Start the service on the configured project port, inspect the HTTP response and route manifest, run automated API/logic checks including a code-answer path and leaderboard score submission, and fix confirmed issues.
6. Commit and push to the current project’s canonical `main` remote for a managed checkpoint. Do not publish publicly or create another GitHub repository unless separately requested.
