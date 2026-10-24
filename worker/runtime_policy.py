"""Política fechada de inferência e identidade operacional sem dados de documentos."""
from __future__ import annotations
import hashlib
import json
import os
import time
import uuid

PREVIEW_TTL_SECONDS = 120
HEARTBEAT_SECONDS = 5
CONFIGURATION_LOADED_AT = int(time.time())
INSTANCE_ID = uuid.uuid4().hex


def inference_enabled():
    """Somente opt-in operacional exato habilita modelos; payload não participa."""
    return os.environ.get("DEVSPHERE_INFERENCE_ENABLED") == "1"


def require_inference():
    """Barreira repetida na fila e em cada chamada do adaptador, inclusive crítica."""
    if not inference_enabled():
        from .core import JobError
        raise JobError("inference_disabled", "Geração por modelos desabilitada neste ambiente; utilize prévia sem inferência.", False)


def digest(value):
    """Assinatura determinística de configuração/entrada; não é token de autorização."""
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def runtime_config():
    """Lista explícita de limites efetivos; nunca coleta ambiente inteiro ou caminhos."""
    from .core import effective_limits, JobError
    try:
        limits = effective_limits()
    except JobError:
        limits = {"configurationError": "invalid_model_config"}
    return {**limits, "inferenceEnabled": inference_enabled(), "codeVersion": "worker-runtime-v1", "contractVersion": "worker-runtime-v1", "concurrency": 1, "configurationLoadedAt": CONFIGURATION_LOADED_AT}


def config_hash():
    """Timestamp não altera identidade de configuração; reinício é detectado no heartbeat."""
    config = runtime_config()
    config.pop("configurationLoadedAt")
    return digest(config)


def input_hash(request):
    """Inclui fonte canônica e trechos autorizados para invalidar prévias obsoletas."""
    return digest({key: request.get(key) for key in ("pages", "instructions", "query", "sourceId", "sourceHash", "markdown", "allowedReferences", "sources")})


def heartbeat(db, now=None):
    """Publica heartbeat do processo pai; polling mantém sinal durante filhos isolados."""
    now = int(time.time()) if now is None else now
    config = runtime_config()
    with db:
        db.execute("INSERT INTO worker_runtime(instance_id,started_at,heartbeat_at,config_json,config_hash) VALUES(?,?,?,?,?) ON CONFLICT(instance_id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at,config_json=excluded.config_json,config_hash=excluded.config_hash", (INSTANCE_ID, CONFIGURATION_LOADED_AT, now, json.dumps(config, ensure_ascii=False), config_hash()))


def require_runtime_schema(db):
    """Não cria schema no daemon: migrations transacionais pertencem à API."""
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='worker_runtime'").fetchone():
        raise RuntimeError("Banco sem diagnóstico do worker. Execute migrations pela API antes de iniciar o daemon.")
