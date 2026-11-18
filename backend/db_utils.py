from typing import Any, Callable, List, Optional
import logging
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError, SQLAlchemyError

logger = logging.getLogger("turk_hub")


def safe_list_query(query_fn: Callable[[], List[Any]], db: Session, resource_name: str) -> List[Any]:
    try:
        return query_fn()
    except OperationalError as exc:
        db.rollback()
        logger.warning("Database operational error while reading %s: %s", resource_name, exc)
        return []
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("Database query error while reading %s: %s", resource_name, exc)
        return []


def safe_first_query(query_fn: Callable[[], Optional[Any]], db: Session, resource_name: str) -> Optional[Any]:
    try:
        return query_fn()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("Database query error while reading %s item: %s", resource_name, exc)
        return None
