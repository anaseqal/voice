"""In-memory job registry. v1 keeps state in RAM; if pod restarts, in-flight jobs are lost.
That's acceptable for the single-user MVP — the web app can re-submit on failure."""
from __future__ import annotations

import asyncio
import contextvars
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

LOG_TAIL_LINES = 30


class JobType(str, Enum):
    TRAIN = "train"
    COVER = "cover"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Job:
    id: str
    type: JobType
    status: JobStatus = JobStatus.QUEUED
    stage: str = ""
    progress: int = 0  # 0-100
    message: str = ""
    error: str | None = None
    result: dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    callback_url: str | None = None
    callback_token: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    task: asyncio.Task | None = None  # type: ignore[type-arg]
    log_tail: deque[str] = field(default_factory=lambda: deque(maxlen=LOG_TAIL_LINES))
    log_seq: int = 0  # bumped on every log_tail append

    def append_log(self, line: str) -> None:
        self.log_tail.append(line)
        self.log_seq += 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "status": self.status.value,
            "stage": self.stage,
            "progress": self.progress,
            "message": self.message,
            "error": self.error,
            "result": self.result,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "log_tail": "\n".join(self.log_tail),
        }


# Set in pipeline.run_training / run_cover so subprocess helpers (pipeline._run_cmd,
# applio_runner._run) can append output lines to the active job's log_tail without
# threading the job arg through every call site.
current_job: contextvars.ContextVar[Job | None] = contextvars.ContextVar(
    "current_job", default=None
)


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()

    def create(
        self,
        type: JobType,
        payload: dict[str, Any],
        callback_url: str | None = None,
        callback_token: str | None = None,
    ) -> Job:
        job = Job(
            id=uuid.uuid4().hex,
            type=type,
            payload=payload,
            callback_url=callback_url,
            callback_token=callback_token,
        )
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        return list(self._jobs.values())


registry = JobRegistry()
