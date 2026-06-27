"""Thin Redis layer with a TTL-cache decorator.

Falls back to a no-op pass-through if REDIS_URL is empty or the Redis server
is unreachable, so the app keeps working without Redis (e.g. local dev where
you didn't bother spinning up the cache container).
"""
from __future__ import annotations

import functools
import json
import logging
from typing import Any, Callable, TypeVar

import redis

from app.core.config import settings

log = logging.getLogger(__name__)

T = TypeVar("T")

_client: redis.Redis | None = None
_disabled = False


def get_client() -> redis.Redis | None:
    """Return a connected Redis client, or None if caching is disabled / unreachable."""
    global _client, _disabled
    if _disabled:
        return None
    if _client is not None:
        return _client
    if not settings.REDIS_URL:
        _disabled = True
        return None
    try:
        client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=2)
        client.ping()
        _client = client
        log.info("Redis cache connected at %s", settings.REDIS_URL)
        return _client
    except redis.RedisError as e:
        log.warning("Redis unreachable (%s) — caching disabled for this process", e)
        _disabled = True
        return None


def ttl_cache(key_prefix: str, ttl_seconds: int = 3600) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Cache a function's JSON-serializable return value in Redis.

    Cache key = key_prefix + ":" + JSON(args, kwargs). For functions with no args,
    key is just key_prefix. TTL is refreshed on every miss-then-set.

    On any Redis error the underlying function is still called normally.
    """
    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            client = get_client()
            if client is None:
                return fn(*args, **kwargs)

            key_payload = (args, kwargs) if (args or kwargs) else None
            key = f"{key_prefix}:{json.dumps(key_payload, default=str, sort_keys=True)}" if key_payload else key_prefix

            try:
                cached = client.get(key)
                if cached is not None:
                    return json.loads(cached)
            except redis.RedisError as e:
                log.debug("Redis GET failed for %s: %s — recomputing", key, e)

            result = fn(*args, **kwargs)
            try:
                client.setex(key, ttl_seconds, json.dumps(result, default=str))
            except (redis.RedisError, TypeError) as e:
                log.debug("Redis SET failed for %s: %s", key, e)
            return result

        return wrapper

    return decorator


def invalidate(key_prefix: str) -> None:
    """Drop every cache entry starting with key_prefix. Safe no-op if Redis is down."""
    client = get_client()
    if client is None:
        return
    try:
        keys = list(client.scan_iter(match=f"{key_prefix}*", count=100))
        if keys:
            client.delete(*keys)
            log.info("Invalidated %d cache entries under %s", len(keys), key_prefix)
    except redis.RedisError as e:
        log.warning("Redis invalidate failed for %s: %s", key_prefix, e)
