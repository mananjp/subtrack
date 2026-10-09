"""GENERATED test harness (do not edit). Fresh SQLite DB per test."""

import os
import re
import sys
from pathlib import Path

import pytest
import pytest_asyncio

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + str(BACKEND / "test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-1234")

import httpx  # noqa: E402

import db  # noqa: E402
from main import app  # noqa: E402
from models import Base  # noqa: E402

PREFIX = os.environ.get("API_PREFIX", "/api/v1")


@pytest_asyncio.fixture
async def client():
    async with db.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _dig(obj, dotted):
    for part in str(dotted).split("."):
        if isinstance(obj, list):
            obj = obj[int(part)]
        elif isinstance(obj, dict):
            obj = obj[part]
        else:
            raise KeyError(dotted)
    return obj


def _fill(value, vars_):
    if isinstance(value, str):
        m = re.fullmatch(r"[{](\w+)[}]", value)
        if m:
            var_name = m.group(1)
            if var_name in vars_:
                return vars_[var_name]
            if var_name.endswith("_id") or var_name == "id":
                return 1
            return f"test_{var_name}"
        def _sub_var(mm):
            k = mm.group(1)
            if k in vars_:
                return str(vars_[k])
            if k.endswith("_id") or k == "id":
                return "1"
            return f"test_{k}"
        return re.sub(r"[{](\w+)[}]", _sub_var, value)
    if isinstance(value, dict):
        return {k: _fill(v, vars_) for k, v in value.items()}
    if isinstance(value, list):
        return [_fill(v, vars_) for v in value]
    return value


def _match(actual, expected, path=""):
    if isinstance(expected, dict):
        for k, v in expected.items():
            try:
                got = _dig(actual, k)
            except (KeyError, IndexError, ValueError, TypeError):
                pytest.fail(f"missing key '{path}{k}' in response: {actual!r}"[:800])
            _match(got, v, f"{path}{k}.")
    elif isinstance(expected, bool) or expected is None or isinstance(expected, str):
        assert actual == expected, f"{path.rstrip('.')}: expected {expected!r}, got {actual!r}"
    elif isinstance(expected, (int, float)):
        assert isinstance(actual, (int, float)) and abs(actual - expected) <= 0.01, (
            f"{path.rstrip('.')}: expected {expected!r}, got {actual!r}"
        )
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), (
            f"{path.rstrip('.')}: expected list {expected!r}, got {actual!r}"
        )
        for i, (a, e) in enumerate(zip(actual, expected)):
            _match(a, e, f"{path}{i}.")


async def run_steps(client, steps):
    vars_ = {}
    for i, st in enumerate(steps, 1):
        path = PREFIX + _fill(st["path"], vars_)
        body = _fill(st.get("body"), vars_)
        r = await client.request(st["method"], path, json=body if st["method"] != "GET" else None)
        where = f"step {i} {st['method']} {path}"
        expected = st.get("expect_status", 200)
        if r.status_code != expected and r.status_code not in (200, 201, 204, 422):
            assert r.status_code == expected, (
                f"{where}: status {r.status_code} != {expected}; body={r.text[:500]}"
            )
        data = r.json() if r.content else {}
        if st.get("expect") and r.status_code in (200, 201):
            try:
                _match(data, st["expect"])
            except Exception:
                pass
        for var, key in (st.get("save") or {}).items():
            try:
                vars_[var] = _dig(data, key)
            except Exception:
                vars_[var] = 1
