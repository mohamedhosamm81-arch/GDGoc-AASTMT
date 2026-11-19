# TODO — GDGoC AASTMT Python Assessment Platform

## Welcome, identity, and Round 1 dashboard
- [x] On first visit, greet the student with: “Hey there, GDGoC AASTMT Explorer! Ready to test your Python skills?”
- [x] Ask for their Full Name without a password or complicated sign-up; after submission, save the name in the student session and smoothly transition to the Round 1 dashboard.
- [x] Prominently display “Created by AI Team | GDG on Campus AASTMT” (or “GDGoC AASTMT”) in the header/footer with clean badge styling.
- [x] Show Quiz 1 (20 questions), Quiz 2 (20 questions), Quiz 3 (20 questions), Round 2 as Locked/Coming Soon, and a Live Global Leaderboard on the dashboard.
- [x] Keep the UI welcoming, calm, intuitive, and distraction-free, using clean white/off-white backgrounds (#FFFFFF, #F8F9FA), subtle borders, rounded cards, smooth transitions, and Google Blue (#4285F4), Red (#EA4335), Yellow (#FBBC05), and Green (#34A853) accents.

## Quiz bank, sequence, formats, and scoring
- [x] Provide 60 completely unique Round 1 questions in three 20-question quizzes, all strictly based on the supplied “Python From Zero – Step by Step” session syllabus.
- [x] Quiz 1 covers topics 1–6 (print/output, comments, variables, data types, operators, strings) and has about 7 Easy, 8 Medium, and 5 Hard/Tricky questions.
- [x] Quiz 2 covers topics 7–13 (input/type conversion, conditions, lists, tuples, sets, dictionaries) and has about 6 Easy, 8 Medium, and 6 Hard/Tricky questions.
- [x] Quiz 3 covers topics 14–15 and comprehensive mixed challenges (loops, range, break/continue, functions, print vs return, default arguments, FizzBuzz, combined data structures/loops/functions) and has about 5 Easy, 8 Medium, and 7 Hard/Tricky questions.
- [x] Cover the listed syllabus concepts, including print arguments/repetition/escape characters and common mistakes; comments; assignment/reassignment/naming/multiple assignment; int/float/str/bool/type and string-vs-number addition; arithmetic/order/comparison/logical/membership operators; string length/indexing/slicing/methods/immutability/f-strings; input returning str and conversions; if/elif/else indentation and first-true behavior; list operations and built-ins; tuple immutability; set uniqueness/methods; dictionary access/update/delete/membership/iteration; for/while/range/accumulators/break/continue/nested patterns; functions/defaults/helpers/print-vs-return; calculator, guessing, shopping bill, even/odd, and FizzBuzz logic.
- [x] Mix “Write the Code” live coding, “Predict the Output,” “Fix the Bug,” Multiple Choice, and Fill-in-the-Blank question formats.
- [x] Students can write real Python code in an editor with syntax highlighting and Tab indentation, select Run Code to see live console output/errors, and select Submit/Check Answer to validate against test cases.
- [x] For live-coding questions, provide test inputs through predefined variables or function parameters rather than blocking input() calls.
- [x] Display a color-coded difficulty and points badge on every question: Easy = 1 point (green), Medium = 2 points (yellow), Hard/Tricky = 3 points (red).
- [x] Explain the session-scoped score anti-farming rule to students. The first completed score in a browser session is retained; the UI and README disclose that name-only sessions are not tamper-proof identities.

## Leaderboard and progress
- [x] Make the live global leaderboard accessible at any time from the navbar and show it prominently after finishing a quiz.
- [x] Rank participating students by Total Points (Quiz 1 + Quiz 2 + Quiz 3).
- [x] Show rank (gold/silver/bronze medals for #1/#2/#3), Student Name, Quiz 1 Score, Quiz 2 Score, Quiz 3 Score, Total Questions Solved, and Total Points.
- [x] Persist student names, quiz progress, individual quiz scores, and total leaderboard points in a simple thread-safe local `leaderboard.json` file; use locking/atomic updates to prevent concurrent submissions from corrupting the file.

## Code execution and data-safety behavior
- [x] Keep student-provided code out of the FastAPI server process by executing it client-side in the planned Web Worker/Pyodide runner; enforce execution timeout and output-size limits and display output/errors.
- [x] Make it clear that browser-side scores are not cryptographically anti-cheat; enforce the requested duplicate-quiz score policy in the API, without claiming stronger verification than the system provides.
- [x] Clearly disclose that hosted runtime-local JSON may be lost on restart/redeploy and is not a durable multi-replica production store; do not silently introduce an external database or Docker setup.

## Run, handoff, and setup
- [x] Verify frontend and backend start smoothly with one command; test a code question and score submission to the leaderboard.
- [x] Create a branded README with dependency installation and run instructions, scoring/attempt policy, and JSON-storage limitations.
- [x] Create a `.gitignore` that ignores `__pycache__/`, `.venv/`, `node_modules/`, `.DS_Store`, generated `leaderboard.json`, and other local build/runtime artifacts.
- [x] Serve a correct `GET /manus-routes.json` manifest for the page route(s), excluding APIs/assets.
- [x] The source prompt’s GitHub repository target is a placeholder; do not invent a GitHub destination. Save the finished project to the current managed project’s canonical `main` remote for a checkpoint; no separate public repository or public publishing is requested.
