import os
import logging
from typing import Optional

logger = logging.getLogger("turk_hub")

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BACKEND_DIR, "uploads")

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "").strip()


def ensure_upload_dir() -> None:
    """Create backend/uploads regardless of the process working directory."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def is_cloudinary_configured() -> bool:
    return bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)


def upload_to_cloudinary(content: bytes, filename: str, folder: str = "turk_hub") -> Optional[str]:
    """Upload binary payload to Cloudinary and return secure URL; None on failure."""
    if not is_cloudinary_configured():
        return None
    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True,
        )
        res = cloudinary.uploader.upload(
            content,
            folder=folder,
            resource_type="auto",
            public_id=os.path.splitext(filename)[0] if filename else None,
            use_filename=True,
            unique_filename=True,
        )
        secure_url = res.get("secure_url") or res.get("url")
        if secure_url:
            return str(secure_url)
    except Exception as exc:
        logger.warning("Cloudinary upload failed; falling back to local/base64 handling: %s", exc)
    return None
