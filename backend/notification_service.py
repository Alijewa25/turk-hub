import asyncio
import json
import logging
from typing import List, Optional
from fastapi import WebSocket
from sqlalchemy.orm import Session
import models

logger = logging.getLogger("turk_hub")


class UserNotificationManager:
    def __init__(self):
        self.connections: dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        conns = self.connections.get(user_id)
        if not conns:
            return
        try:
            conns.remove(websocket)
        except ValueError:
            pass
        if not conns:
            self.connections.pop(user_id, None)

    async def send_notification(self, user_id: int, payload: dict):
        conns = list(self.connections.get(user_id, []))
        if not conns:
            return
        message = json.dumps(payload, default=str)
        dead = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)


user_notification_manager = UserNotificationManager()


def push_user_notification(user_id: int, payload: dict) -> None:
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(user_notification_manager.send_notification(user_id, payload))
    except RuntimeError:
        try:
            asyncio.run(user_notification_manager.send_notification(user_id, payload))
        except Exception:
            logger.debug("Could not push WS notification to user %s", user_id)
    except Exception:
        logger.debug("Could not push WS notification to user %s", user_id)


def serialize_notification(n: models.Notification, actor: Optional[models.User] = None) -> dict:
    actor_data = None
    if actor:
        actor_data = {
            "id": actor.id,
            "full_name": actor.full_name,
            "username": actor.username,
            "email": actor.email,
            "country": actor.country,
            "university": actor.university,
            "bio": actor.bio,
            "profile_picture": actor.profile_picture,
        }
    return {
        "id": n.id,
        "user_id": n.user_id,
        "actor_id": n.actor_id,
        "actor": actor_data,
        "type": n.type,
        "entity_type": n.entity_type,
        "entity_id": n.entity_id,
        "content": n.content,
        "actor_name": actor.full_name if actor else None,
        "actor_avatar": actor.profile_picture if actor else None,
        "post_id": n.entity_id if n.entity_type == "post" else None,
        "message": n.content,
        "is_read": bool(n.is_read),
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


def create_notification(
    db: Session,
    user_id: int,
    actor_id: Optional[int],
    notif_type: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    content: Optional[str] = None,
) -> Optional[models.Notification]:
    if actor_id and user_id == actor_id:
        return None
    try:
        notif = models.Notification(
            user_id=user_id,
            actor_id=actor_id,
            type=notif_type,
            entity_type=entity_type,
            entity_id=entity_id,
            content=content,
            is_read=0,
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)

        actor = db.query(models.User).filter(models.User.id == actor_id).first() if actor_id else None
        event = {
            "type": "notification",
            "notification": serialize_notification(notif, actor),
        }
        push_user_notification(user_id, event)
        return notif
    except Exception:
        db.rollback()
        logger.exception("Failed to create notification for user %s", user_id)
        return None
