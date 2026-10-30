FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    PATH="/app/.venv/bin:$PATH" \
    HOST=0.0.0.0 \
    PORT=8000

WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
COPY alembic.ini ./
COPY alembic ./alembic
COPY src ./src
RUN uv sync --locked --no-editable

RUN useradd --create-home --uid 10001 appuser
USER appuser
EXPOSE 8000
CMD ["urban-heat-mitigation"]
