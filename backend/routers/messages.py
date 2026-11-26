import asyncio
import json
import logging
import uuid
from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth_utils import ALGORITHM, SECRET_KEY, get_current_user
from database import SessionLocal, get_db
from db_utils import safe_first_query, safe_list_query
from notification_service import (
    create_notification,
    push_user_notification,
    serialize_notification,
    user_notification_manager,
)
from routers.auth import follow_info

logger = logging.getLogger("turk_hub")

router = APIRouter(tags=["messages"])


# --- WEBSOCKET CONNECTION MANAGER FOR CHAT ROOMS ---

class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        self.rooms.setdefault(room_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            try:
                self.rooms[room_id].remove(websocket)
            except ValueError:
                pass
            if not self.rooms[room_id]:
                self.rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, message: str):
        dead: List[WebSocket] = []
        for connection in list(self.rooms.get(room_id, [])):
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(connection, room_id)


manager = ConnectionManager()


def _ws_user(token: Optional[str], db: Session) -> Optional[models.User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            return None
        return db.query(models.User).filter(models.User.email == email).first()
    except JWTError:
        return None


def _ws_display_name(user: Optional[models.User], client_id: str) -> str:
    if user:
        return user.full_name or user.username or f"İstifadəçi #{client_id}"
    return f"İstifadəçi #{client_id}"


HEARTBEAT_INTERVAL = 15.0
HEARTBEAT_PING = '{"type":"ping"}'
HEARTBEAT_PONG = '{"type":"pong"}'


def _heartbeat_kind(raw: str) -> Optional[str]:
    text = raw.strip().lower()
    if text in {"ping", "pong"}:
        return text
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if isinstance(payload, dict) and payload.get("type") in {"ping", "pong"}:
        return payload["type"]
    return None


async def _ws_heartbeat(websocket: WebSocket):
    """Keep Render/proxy idle connections alive with a ping every 15 seconds."""
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await websocket.send_text(HEARTBEAT_PING)
    except asyncio.CancelledError:
        raise
    except Exception:
        return


async def _chat_loop(websocket: WebSocket, room_id: str, client_id: str, token: Optional[str] = None):
    db = SessionLocal()
    user = _ws_user(token, db)
    display = _ws_display_name(user, client_id)

    await manager.connect(websocket, room_id)
    heartbeat_task = asyncio.create_task(_ws_heartbeat(websocket))
    await manager.broadcast(room_id, f"{display} söhbətə qoşuldu 🐺")
    try:
        while True:
            data = await websocket.receive_text()

            kind = _heartbeat_kind(data)
            if kind == "ping":
                await websocket.send_text(HEARTBEAT_PONG)
                continue
            if kind == "pong":
                continue

            if user:
                message = models.RoomMessage(
                    room_id=room_id,
                    sender_id=user.id,
                    content=data,
                )
                db.add(message)
                db.commit()
                db.refresh(message)
                await manager.broadcast(
                    room_id,
                    json.dumps(
                        {
                            "type": "message",
                            "id": message.id,
                            "room_id": message.room_id,
                            "sender_id": user.id,
                            "sender_name": user.full_name,
                            "sender_username": user.username,
                            "sender_country": user.country,
                            "sender_avatar": user.profile_picture,
                            "content": message.content,
                            "created_at": message.created_at,
                        },
                        default=str,
                    ),
                )
            else:
                await manager.broadcast(room_id, f"{display}: {data}")
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket chat loop failed for room %s", room_id)
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except (asyncio.CancelledError, Exception):
            pass
        manager.disconnect(websocket, room_id)
        try:
            await manager.broadcast(room_id, f"{display} söhbətdən ayrıldı.")
        except Exception:
            logger.warning("Could not broadcast disconnect for room %s", room_id, exc_info=True)
        db.close()


# --- ROOM MESSAGES HISTORY ---

@router.get("/api/rooms/{room_id}/messages", response_model=List[schemas.RoomMessageResponse])
def get_room_messages(
    room_id: str,
    limit: int = Query(50, ge=1, le=50),
    _: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    messages = (
        db.query(models.RoomMessage)
        .join(models.User, models.RoomMessage.sender_id == models.User.id)
        .filter(models.RoomMessage.room_id == room_id)
        .order_by(models.RoomMessage.created_at.desc(), models.RoomMessage.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": message.id,
            "room_id": message.room_id,
            "sender_id": message.sender_id,
            "sender_name": message.sender.full_name,
            "sender_username": message.sender.username,
            "sender_country": message.sender.country,
            "sender_avatar": message.sender.profile_picture,
            "content": message.content,
            "created_at": message.created_at,
        }
        for message in reversed(messages)
    ]


# --- DIRECT MESSAGES (DM) ---

@router.get("/api/messages/conversations")
@router.get("/messages/conversations")
def conversations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    sent = safe_list_query(
        lambda: db.query(models.Message.receiver_id).filter(models.Message.sender_id == current_user.id).distinct().all(),
        db,
        "sent conversations",
    )
    received = safe_list_query(
        lambda: db.query(models.Message.sender_id).filter(models.Message.receiver_id == current_user.id).distinct().all(),
        db,
        "received conversations",
    )
    ids = set([s[0] for s in sent] + [r[0] for r in received])
    users = []
    for uid in ids:
        u = safe_first_query(
            lambda: db.query(models.User).filter(models.User.id == uid).first(),
            db,
            "conversation user",
        )
        if u:
            try:
                users.append(follow_info(u, current_user, db))
            except Exception:
                logger.warning("Could not serialize conversation user %s", getattr(u, "id", "?"), exc_info=True)
    return users


@router.get("/api/messages")
@router.get("/messages")
def list_messages(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return conversations(current_user, db)


@router.get("/api/messages/{user_id}", response_model=List[schemas.MessageResponse])
@router.get("/messages/{user_id}", response_model=List[schemas.MessageResponse])
def get_messages(user_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    msgs = safe_list_query(
        lambda: db.query(models.Message).filter(
            ((models.Message.sender_id == current_user.id) & (models.Message.receiver_id == user_id)) |
            ((models.Message.sender_id == user_id) & (models.Message.receiver_id == current_user.id))
        ).options(
            joinedload(models.Message.sender),
            joinedload(models.Message.receiver),
        ).order_by(models.Message.created_at.asc()).all(),
        db,
        "messages",
    )
    result = []
    for m in msgs:
        try:
            result.append(schemas.MessageResponse(
                id=m.id,
                sender_id=m.sender_id,
                receiver_id=m.receiver_id,
                content=m.content,
                read=m.read,
                created_at=m.created_at,
                sender=schemas.UserResponse.model_validate(m.sender) if m.sender else None,
                receiver=schemas.UserResponse.model_validate(m.receiver) if m.receiver else None,
            ))
        except Exception:
            logger.warning("Could not serialize message %s", getattr(m, "id", "?"), exc_info=True)
    return result


@router.post("/api/messages", response_model=schemas.MessageResponse)
@router.post("/messages", response_model=schemas.MessageResponse)
async def send_message(payload: schemas.MessageCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.receiver_id is None:
        raise HTTPException(status_code=400, detail="Alıcı ID tələb olunur")
    if not (payload.content or "").strip():
        raise HTTPException(status_code=400, detail="Mesaj boş ola bilməz")
    if payload.receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Özünüzə mesaj göndərə bilməzsiniz")
    receiver = db.query(models.User).filter(models.User.id == payload.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="Alıcı tapılmadı")
    msg = models.Message(sender_id=current_user.id, receiver_id=payload.receiver_id, content=payload.content.strip())
    db.add(msg)
    db.commit()
    db.refresh(msg)

    create_notification(
        db=db,
        user_id=payload.receiver_id,
        actor_id=current_user.id,
        notif_type="message",
        entity_type="message",
        entity_id=msg.id,
        content=msg.content[:100],
    )
    response = schemas.MessageResponse(
        id=msg.id,
        sender_id=msg.sender_id,
        receiver_id=msg.receiver_id,
        content=msg.content,
        read=msg.read,
        created_at=msg.created_at,
        sender=schemas.UserResponse.model_validate(current_user),
        receiver=schemas.UserResponse.model_validate(receiver),
    )
    push_user_notification(
        receiver.id,
        {"type": "direct_message", "message": response.model_dump(mode="json")},
    )
    return response


# --- NOTIFICATIONS REST ---

@router.get("/api/notifications")
@router.get("/notifications")
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        q = db.query(models.Notification).filter(models.Notification.user_id == current_user.id)
        if unread_only:
            q = q.filter(models.Notification.is_read == 0)
        items = q.order_by(models.Notification.created_at.desc()).limit(limit).all()

        unread_count = db.query(models.Notification).filter(
            models.Notification.user_id == current_user.id,
            models.Notification.is_read == 0,
        ).count()

        serialized = [serialize_notification(n, n.actor) for n in items]
        return {
            "unread_count": unread_count,
            "notifications": serialized,
            "items": serialized,
        }
    except Exception:
        logger.exception("Failed to fetch notifications for user %s", getattr(current_user, "id", "?"))
        return {
            "unread_count": 0,
            "notifications": [],
            "items": [],
        }


@router.patch("/api/notifications/read")
@router.post("/api/notifications/read")
@router.patch("/notifications/read")
@router.post("/notifications/read")
@router.post("/api/notifications/mark-all-read")
@router.post("/notifications/mark-all-read")
def mark_notifications_read(
    payload: Optional[dict] = Body(default=None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = payload or {}
    notif_id = payload.get("id") or payload.get("notification_id")
    ids = payload.get("ids")

    if notif_id is not None:
        try:
            nid = int(notif_id)
            db.query(models.Notification).filter(
                models.Notification.user_id == current_user.id,
                models.Notification.id == nid,
            ).update({"is_read": 1})
        except (ValueError, TypeError):
            pass
    elif ids and isinstance(ids, list):
        clean_ids = [int(i) for i in ids if isinstance(i, (int, str)) and str(i).isdigit()]
        if clean_ids:
            db.query(models.Notification).filter(
                models.Notification.user_id == current_user.id,
                models.Notification.id.in_(clean_ids),
            ).update({"is_read": 1}, synchronize_session=False)
    else:
        # Mark all as read
        db.query(models.Notification).filter(
            models.Notification.user_id == current_user.id,
            models.Notification.is_read == 0,
        ).update({"is_read": 1}, synchronize_session=False)

    db.commit()
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == 0,
    ).count()
    return {"status": "ok", "unread_count": unread_count}


@router.patch("/api/notifications/{notification_id}/read")
@router.patch("/notifications/{notification_id}/read")
def mark_notification_read_by_id(
    notification_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id,
    ).update({"is_read": 1})
    db.commit()
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == 0,
    ).count()
    return {"status": "ok", "unread_count": unread_count}


@router.post("/api/notifications/read-all")
@router.post("/notifications/read-all")
def mark_all_notifications_read_alias(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == 0,
    ).update({"is_read": 1}, synchronize_session=False)
    db.commit()
    return {"status": "ok", "unread_count": 0}


@router.patch("/api/notifications/{notification_id}/read")
@router.post("/api/notifications/{notification_id}/read")
@router.patch("/notifications/{notification_id}/read")
@router.post("/notifications/{notification_id}/read")
def mark_single_notification_read(
    notification_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.id == notification_id,
    ).update({"is_read": 1})
    db.commit()
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == 0,
    ).count()
    return {"status": "ok", "unread_count": unread_count}


# --- WEBSOCKET ENDPOINTS ---

@router.websocket("/api/ws/chat/global/{client_id}")
@router.websocket("/ws/chat/global/{client_id}")
async def websocket_global_endpoint(
    websocket: WebSocket,
    client_id: str,
    token: Optional[str] = Query(None),
):
    await _chat_loop(websocket, "global", client_id, token)


@router.websocket("/api/ws/chat/{room_id}/{client_id}")
@router.websocket("/ws/chat/{room_id}/{client_id}")
@router.websocket("/api/ws/chat/{room_id}")
@router.websocket("/ws/chat/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    client_id: str = "guest",
    token: Optional[str] = Query(None),
):
    known_rooms = {"az", "tr", "kk", "uz", "tk", "tm", "ky", "global"}
    has_client_path = "client_id" in websocket.path_params
    target_room = room_id

    if not has_client_path:
        if room_id in known_rooms:
            client_id = f"web-{uuid.uuid4().hex[:8]}"
        else:
            client_id = room_id or "guest"
            target_room = "global"

    await _chat_loop(websocket, target_room, client_id, token)


@router.websocket("/api/ws/notifications")
@router.websocket("/ws/notifications")
@router.websocket("/api/ws/notifications/{user_id}")
@router.websocket("/ws/notifications/{user_id}")
async def websocket_notifications_endpoint(
    websocket: WebSocket,
    user_id: Optional[str] = None,
    token: Optional[str] = Query(None),
):
    resolved_user_id: Optional[int] = None
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        token_payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = token_payload.get("sub")
        if email:
            db = SessionLocal()
            try:
                user = db.query(models.User).filter(models.User.email == email).first()
                if user:
                    resolved_user_id = user.id
            finally:
                db.close()
    except JWTError:
        resolved_user_id = None

    if resolved_user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if user_id:
        try:
            requested_user_id = int(user_id)
        except (ValueError, TypeError):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        if requested_user_id != resolved_user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    await user_notification_manager.connect(resolved_user_id, websocket)
    heartbeat_task = asyncio.create_task(_ws_heartbeat(websocket))
    try:
        while True:
            data = await websocket.receive_text()
            kind = _heartbeat_kind(data)
            if kind == "ping":
                await websocket.send_text(HEARTBEAT_PONG)
                continue
            if kind == "pong":
                continue
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket notifications error for user %s", resolved_user_id)
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except (asyncio.CancelledError, Exception):
            pass
        user_notification_manager.disconnect(resolved_user_id, websocket)
