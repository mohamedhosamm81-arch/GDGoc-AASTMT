from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app import main
from app.question_bank import all_questions
from app.storage import JsonStore


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", JsonStore(tmp_path / "leaderboard.json"))
    with TestClient(main.app) as test_client:
        yield test_client


def create_student(client: TestClient, name: str = "  Ada   Lovelace ") -> str:
    student_id = str(uuid.uuid4())
    response = client.post("/api/session", json={"student_id": student_id, "name": name})
    assert response.status_code == 200
    assert response.json()["name"] == "Ada Lovelace"
    return student_id


def test_bank_has_sixty_unique_questions_and_requested_difficulty_mix():
    bank = all_questions()
    assert len(bank) == 60
    assert len({question["id"] for question in bank}) == 60
    assert len({question["prompt"] for question in bank}) == 60
    expected = {
        1: {"easy": 7, "medium": 8, "hard": 5},
        2: {"easy": 6, "medium": 8, "hard": 6},
        3: {"easy": 5, "medium": 8, "hard": 7},
    }
    for quiz_id, distribution in expected.items():
        quiz = [q for q in bank if q["quiz_id"] == quiz_id]
        assert len(quiz) == 20
        assert {difficulty: sum(q["difficulty"] == difficulty for q in quiz) for difficulty in distribution} == distribution
        assert all(q["points"] == {"easy": 1, "medium": 2, "hard": 3}[q["difficulty"]] for q in quiz)


def test_public_question_api_does_not_include_answer_keys(client: TestClient):
    response = client.get("/api/questions/1")
    assert response.status_code == 200
    questions = response.json()["questions"]
    assert len(questions) == 20
    assert all("answer" not in question and "explanation" not in question for question in questions)
    assert questions[0]["points"] == 1


def test_session_and_progress_are_saved(client: TestClient):
    student_id = create_student(client)
    question_id = "q1_01"
    saved = client.put(
        "/api/progress/1",
        json={"student_id": student_id, "current_question": 2, "answers": {question_id: {"answer": "b"}}},
    )
    assert saved.status_code == 200
    progress = client.get(f"/api/progress/1?student_id={student_id}")
    assert progress.json()["current_question"] == 2
    assert progress.json()["answers"][question_id]["answer"] == "b"


def test_grading_handles_choice_and_hidden_code_tests(client: TestClient):
    choice = client.post("/api/check", json={"quiz_id": 1, "question_id": "q1_01", "response": {"answer": "b"}})
    assert choice.status_code == 200
    assert choice.json()["correct"] is True
    assert choice.json()["points_awarded"] == 1

    code = client.post(
        "/api/check",
        json={"quiz_id": 1, "question_id": "q1_13", "response": {"actuals": ["GoGo!", "pypypy!", "!"], "error": None}},
    )
    assert code.status_code == 200
    assert code.json()["correct"] is True
    assert code.json()["points_awarded"] == 2

    wrong = client.post(
        "/api/check",
        json={"quiz_id": 1, "question_id": "q1_13", "response": {"actuals": ["wrong"], "error": None}},
    )
    assert wrong.json()["correct"] is False


def test_first_quiz_score_is_kept_and_leaderboard_updates(client: TestClient):
    student_id = create_student(client)
    first = client.post(
        "/api/submit/1",
        json={"student_id": student_id, "quiz_id": 1, "answers": {"q1_01": {"answer": "b"}}},
    )
    assert first.status_code == 200
    assert first.json()["score_points"] == 1
    assert first.json()["solved"] == 1
    assert first.json()["first_score_kept"] is False

    repeat = client.post(
        "/api/submit/1",
        json={"student_id": student_id, "quiz_id": 1, "answers": {"q1_13": {"actuals": ["GoGo!", "pypypy!", "!"], "error": None}}},
    )
    assert repeat.status_code == 200
    assert repeat.json()["score_points"] == 1
    assert repeat.json()["solved"] == 1
    assert repeat.json()["first_score_kept"] is True

    board = client.get(f"/api/leaderboard?student_id={student_id}").json()
    assert board["my_rank"] == 1
    row = board["leaderboard"][0]
    assert row["total_points"] == 1
    assert row["total_questions_solved"] == 1
    assert row["quiz_scores"]["1"]["score_points"] == 1


def test_concurrent_json_updates_keep_all_students(tmp_path):
    store = JsonStore(tmp_path / "leaderboard.json")
    ids = [str(uuid.uuid4()) for _ in range(12)]

    def add(student_id: str) -> None:
        store.update(lambda data: data["students"].__setitem__(student_id, {"name": student_id, "quizzes": {}, "progress": {}}))

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(add, ids))
    assert set(store.read()["students"]) == set(ids)


def test_every_question_accepts_its_defined_correct_response():
    from app.question_bank import grade_question

    for question in all_questions():
        if question["type"] == "code":
            response = {"actuals": question["answer"], "error": None}
        elif question["type"] == "fix_bug":
            response = {"output": question["answer"], "error": None}
        elif question["type"] == "fill_blank":
            answer = question["answer"][0] if isinstance(question["answer"], list) else question["answer"]
            response = {"answer": answer}
        else:
            response = {"answer": question["answer"]}
        assert grade_question(question, response), question["id"]


def test_route_manifest_is_served_as_json(client: TestClient):
    response = client.get("/manus-routes.json")
    assert response.status_code == 200
    assert response.json() == {"routes": [{"path": "/", "title": "Python From Zero — GDGoC AASTMT"}]}
