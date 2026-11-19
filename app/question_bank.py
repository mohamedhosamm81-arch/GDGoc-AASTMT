from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

BANK_PATH = Path(__file__).resolve().parent / "data" / "questions.json"


@lru_cache(maxsize=1)
def _load() -> list[dict[str, Any]]:
    with BANK_PATH.open("r", encoding="utf-8") as stream:
        questions = json.load(stream)
    if len(questions) != 60:
        raise ValueError(f"Expected exactly 60 questions, found {len(questions)}")
    seen: set[str] = set()
    for question in questions:
        required = {"id", "quiz_id", "number", "difficulty", "type", "prompt", "answer", "explanation"}
        if not required.issubset(question):
            raise ValueError(f"Question is missing required fields: {question.get('id', '<unknown>')}")
        if question["id"] in seen:
            raise ValueError(f"Duplicate question id: {question['id']}")
        seen.add(question["id"])
        if question["difficulty"] not in {"easy", "medium", "hard"}:
            raise ValueError(f"Invalid difficulty for {question['id']}")
        question["points"] = {"easy": 1, "medium": 2, "hard": 3}[question["difficulty"]]
    return questions


def all_questions() -> list[dict[str, Any]]:
    return _load()


def quiz_questions(quiz_id: int) -> list[dict[str, Any]]:
    if quiz_id not in (1, 2, 3):
        raise ValueError("quiz_id must be 1, 2, or 3")
    return [q for q in _load() if q["quiz_id"] == quiz_id]


def get_question(question_id: str) -> dict[str, Any] | None:
    return next((q for q in _load() if q["id"] == question_id), None)


def public_question(question: dict[str, Any]) -> dict[str, Any]:
    """Return learner-facing material but never the hidden answer or rationale."""
    return {key: value for key, value in question.items() if key not in {"answer", "explanation", "accepted_answers"}}


def _clean_text(value: Any) -> str:
    return str(value if value is not None else "").replace("\r\n", "\n").replace("\r", "\n").strip()


def grade_question(question: dict[str, Any], response: dict[str, Any] | None) -> bool:
    response = response or {}
    kind = question["type"]
    expected = question["answer"]

    if kind == "code":
        if response.get("error"):
            return False
        actuals = response.get("actuals")
        return isinstance(actuals, list) and actuals == expected

    if kind == "fix_bug":
        if response.get("error"):
            return False
        return _clean_text(response.get("output")) == _clean_text(expected)

    answer = response.get("answer")
    if kind == "fill_blank":
        valid = expected if isinstance(expected, list) else [expected]
        normalized = re.sub(r"\s+", " ", _clean_text(answer)).casefold()
        return normalized in {re.sub(r"\s+", " ", _clean_text(item)).casefold() for item in valid}
    if kind in {"mcq", "predict"}:
        return _clean_text(answer) == _clean_text(expected)
    return False


def grade_quiz(questions: list[dict[str, Any]], responses: dict[str, dict[str, Any]]) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    points = 0
    solved = 0
    for question in questions:
        user_resp = responses.get(question["id"]) or {}
        correct = grade_question(question, user_resp)
        if correct:
            points += question["points"]
            solved += 1

        # Format user answer for display
        raw_user = user_resp.get("answer")
        if raw_user is None:
            raw_user = user_resp.get("output") or user_resp.get("code") or "(No answer)"

        results.append({
            "question_id": question["id"],
            "number": question.get("number", 0),
            "prompt": question.get("prompt", ""),
            "type": question.get("type", "mcq"),
            "correct": correct,
            "points_awarded": question["points"] if correct else 0,
            "points_possible": question["points"],
            "explanation": question["explanation"],
            "correct_answer": question["answer"],
            "user_answer": str(raw_user),
        })
    return {
        "score_points": points,
        "possible_points": sum(q["points"] for q in questions),
        "solved": solved,
        "question_count": len(questions),
        "results": results,
    }
