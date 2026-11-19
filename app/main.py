from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from app.question_bank import all_questions, get_question, grade_question, grade_quiz, public_question, quiz_questions
from app.storage import JsonStore

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"
app = FastAPI(title="Python From Zero · GDGoC AASTMT", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
store = JsonStore()


class SessionRequest(BaseModel):
    student_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=100)

    @field_validator("student_id")
    @classmethod
    def valid_student_id(cls, value: str) -> str:
        try:
            return str(uuid.UUID(value))
        except ValueError as exc:
            raise ValueError("student_id must be a UUID") from exc

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = re.sub(r"\s+", " ", value).strip()
        if len(value) < 2:
            raise ValueError("Please enter your full name (at least 2 characters).")
        return value[:60]


class ProgressRequest(BaseModel):
    student_id: str = Field(min_length=1, max_length=64)
    current_question: int = Field(ge=1, le=20)
    answers: dict[str, dict[str, Any]] = Field(default_factory=dict)

    @field_validator("student_id")
    @classmethod
    def valid_student_id(cls, value: str) -> str:
        try:
            return str(uuid.UUID(value))
        except ValueError as exc:
            raise ValueError("student_id must be a UUID") from exc

    @field_validator("answers")
    @classmethod
    def bounded_answers(cls, value: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        if len(value) > 20 or sum(len(str(item)) for item in value.values()) > 80_000:
            raise ValueError("Progress payload is too large")
        return value


class AnswerRequest(BaseModel):
    quiz_id: int = Field(ge=1, le=3)
    question_id: str = Field(min_length=3, max_length=16)
    response: dict[str, Any] = Field(default_factory=dict)


class SubmitRequest(BaseModel):
    student_id: str = Field(min_length=1, max_length=64)
    quiz_id: int = Field(ge=1, le=3)
    answers: dict[str, dict[str, Any]] = Field(default_factory=dict)

    @field_validator("student_id")
    @classmethod
    def valid_student_id(cls, value: str) -> str:
        try:
            return str(uuid.UUID(value))
        except ValueError as exc:
            raise ValueError("student_id must be a UUID") from exc

    @field_validator("answers")
    @classmethod
    def bounded_answers(cls, value: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        if len(value) > 20 or sum(len(str(item)) for item in value.values()) > 100_000:
            raise ValueError("Answer payload is too large")
        return value


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _student(data: dict[str, Any], student_id: str) -> dict[str, Any]:
    student = data.get("students", {}).get(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student session not found. Please enter your name again.")
    return student


def _quiz_record(quiz: dict[str, Any]) -> dict[str, Any]:
    return {
        "score_points": quiz["score_points"],
        "possible_points": quiz["possible_points"],
        "solved": quiz["solved"],
        "question_count": quiz["question_count"],
        "completed_at": quiz["completed_at"],
    }


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/manus-routes.json", include_in_schema=False)
def route_manifest() -> FileResponse:
    return FileResponse(ROOT / "public" / "manus-routes.json", media_type="application/json")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "pythonround1"}


@app.get("/api/questions/{quiz_id}")
def questions(quiz_id: int) -> dict[str, Any]:
    try:
        items = quiz_questions(quiz_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"quiz_id": quiz_id, "questions": [public_question(q) for q in items]}


@app.post("/api/session")
def create_session(payload: SessionRequest) -> dict[str, Any]:
    def upsert(data: dict[str, Any]) -> dict[str, Any]:
        students = data.setdefault("students", {})
        normalized_name = re.sub(r"\s+", " ", payload.name).strip().casefold()

        # Case 1: Same student_id already exists in this browser session → normal restore
        if payload.student_id in students:
            student = students[payload.student_id]
            student["name"] = payload.name
            student.setdefault("quizzes", {})
            student.setdefault("progress", {})
            student["last_seen"] = _utc_now()
            return {"student_id": payload.student_id, "name": student["name"], "quizzes": student["quizzes"]}

        # Case 2: New session (e.g. incognito or different device) tries to use an already taken name
        for existing_id, existing_student in students.items():
            if re.sub(r"\s+", " ", existing_student.get("name", "")).strip().casefold() == normalized_name:
                raise HTTPException(
                    status_code=400,
                    detail="This name is already registered on the leaderboard! Since this is a competitive quiz, only one attempt is allowed per participant. Please enter your full name or a unique name.",
                )

        # Case 3: Brand new student with a unique name
        student = students.setdefault(payload.student_id, {"quizzes": {}, "progress": {}})
        student["name"] = payload.name
        student.setdefault("quizzes", {})
        student.setdefault("progress", {})
        student["last_seen"] = _utc_now()
        return {"student_id": payload.student_id, "name": student["name"], "quizzes": student["quizzes"]}

    return store.update(upsert)


@app.get("/api/progress/{quiz_id}")
def get_progress(quiz_id: int, student_id: str = Query(min_length=1, max_length=64)) -> dict[str, Any]:
    if quiz_id not in (1, 2, 3):
        raise HTTPException(status_code=404, detail="Quiz not found")
    try:
        student_id = str(uuid.UUID(student_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid student id") from exc
    student = _student(store.read(), student_id)
    return student.get("progress", {}).get(str(quiz_id), {"current_question": 1, "answers": {}})


@app.put("/api/progress/{quiz_id}")
def save_progress(quiz_id: int, payload: ProgressRequest) -> dict[str, Any]:
    if quiz_id not in (1, 2, 3):
        raise HTTPException(status_code=404, detail="Quiz not found")
    allowed_ids = {q["id"] for q in quiz_questions(quiz_id)}
    if not set(payload.answers).issubset(allowed_ids):
        raise HTTPException(status_code=400, detail="Progress contains a question from another quiz")

    def update(data: dict[str, Any]) -> dict[str, Any]:
        student = _student(data, payload.student_id)
        if str(quiz_id) in student.get("quizzes", {}):
            return {"saved": False, "completed": True}
        progress = {"current_question": payload.current_question, "answers": payload.answers, "updated_at": _utc_now()}
        student.setdefault("progress", {})[str(quiz_id)] = progress
        student["last_seen"] = _utc_now()
        return {"saved": True, "completed": False}

    return store.update(update)


@app.post("/api/check")
def check_answer(payload: AnswerRequest) -> dict[str, Any]:
    question = get_question(payload.question_id)
    if question is None or question["quiz_id"] != payload.quiz_id:
        raise HTTPException(status_code=404, detail="Question not found in this quiz")
    resp = payload.response or {}
    ans = str(resp.get("answer") if resp.get("answer") is not None else "").strip()
    code = str(resp.get("code") if resp.get("code") is not None else "").strip()
    actuals = resp.get("actuals")
    output = resp.get("output")
    if not ans and not code and actuals is None and output is None:
        raise HTTPException(status_code=400, detail="Please provide an answer before checking")
    correct = grade_question(question, payload.response)
    return {
        "correct": correct,
        "points_awarded": question["points"] if correct else 0,
        "points_possible": question["points"],
        "explanation": question["explanation"] if correct else "Not quite right yet. Review your logic and try again!",
    }


@app.post("/api/submit/{quiz_id}")
def submit_quiz(quiz_id: int, payload: SubmitRequest) -> dict[str, Any]:
    if quiz_id != payload.quiz_id:
        raise HTTPException(status_code=400, detail="Quiz id mismatch")
    questions_for_quiz = quiz_questions(quiz_id)
    allowed_ids = {q["id"] for q in questions_for_quiz}
    if not set(payload.answers).issubset(allowed_ids):
        raise HTTPException(status_code=400, detail="Submission contains a question from another quiz")
    result = grade_quiz(questions_for_quiz, payload.answers)

    def persist(data: dict[str, Any]) -> dict[str, Any]:
        student = _student(data, payload.student_id)
        quizzes = student.setdefault("quizzes", {})
        key = str(quiz_id)
        if key in quizzes:
            return {**_quiz_record(quizzes[key]), "first_score_kept": True, "results": quizzes[key].get("results", [])}
        stored = {**result, "completed_at": _utc_now()}
        quizzes[key] = stored
        student.setdefault("progress", {}).pop(key, None)
        student["last_seen"] = _utc_now()
        return {**_quiz_record(stored), "first_score_kept": False, "results": result["results"]}

    return store.update(persist)


@app.get("/api/leaderboard")
def leaderboard(student_id: str | None = Query(default=None, max_length=64)) -> dict[str, Any]:
    data = store.read()
    rows = []
    for sid, student in data.get("students", {}).items():
        quizzes = student.get("quizzes", {})
        points = sum(int(q.get("score_points", 0)) for q in quizzes.values())
        solved = sum(int(q.get("solved", 0)) for q in quizzes.values())
        row = {
            "student_id": sid,
            "name": student.get("name", "Student"),
            "quiz_scores": {str(i): _quiz_record(quizzes[str(i)]) if str(i) in quizzes else None for i in (1, 2, 3)},
            "total_questions_solved": solved,
            "total_points": points,
        }
        rows.append(row)
    rows.sort(key=lambda item: (-item["total_points"], -item["total_questions_solved"], item["name"].casefold(), item["student_id"]))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    my_rank = None
    if student_id:
        try:
            canonical_id = str(uuid.UUID(student_id))
            my_rank = next((row["rank"] for row in rows if row["student_id"] == canonical_id), None)
        except ValueError:
            my_rank = None
    return {"leaderboard": rows, "my_rank": my_rank, "updated_at": _utc_now()}


@app.get("/api/meta")
def meta() -> dict[str, Any]:
    counts = {str(i): len(quiz_questions(i)) for i in (1, 2, 3)}
    return {"brand": "Created by AI Team | GDG on Campus AASTMT", "quiz_counts": counts, "questions_total": len(all_questions())}
