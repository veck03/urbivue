"""Shared HTTP query validation helpers."""

from fastapi import HTTPException


def validate_period(year: int, month: int) -> tuple[int, int]:
    if not 1 <= month <= 12:
        raise HTTPException(status_code=422, detail="month must be between 1 and 12")
    if not 1900 <= year <= 2100:
        raise HTTPException(status_code=422, detail="year must be between 1900 and 2100")
    return year, month
