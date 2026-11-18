import asyncio
import json
import logging
import os
import re
import ssl
from typing import List, Optional
from urllib import parse as urllib_parse
from urllib import request as urllib_request
import schemas

logger = logging.getLogger("turk_hub")

SUPPORTED_TRANSLATION_LANGS = {"az", "tr", "kk", "uz", "tk", "ky", "en"}

TRANSLATION_LANG_ALIASES = {
    "az": "az",
    "aze": "az",
    "azerbaijani": "az",
    "azerbaijan": "az",
    "azerbaijani_turkish": "az",
    "tr": "tr",
    "tur": "tr",
    "turkish": "tr",
    "turkiye": "tr",
    "turkey": "tr",
    "kk": "kk",
    "kaz": "kk",
    "kazakh": "kk",
    "qazaq": "kk",
    "uz": "uz",
    "uzb": "uz",
    "uzbek": "uz",
    "ozbek": "uz",
    "tk": "tk",
    "tm": "tk",
    "tkm": "tk",
    "turkmen": "tk",
    "turkmenistan": "tk",
    "ky": "ky",
    "kyg": "ky",
    "kyrgyz": "ky",
    "kirgiz": "ky",
    "en": "en",
    "eng": "en",
    "english": "en",
}

TRANSLATION_PROVIDER_CODES = {
    "az": "az",
    "tr": "tr",
    "kk": "kk",
    "uz": "uz",
    "tk": "tk",
    "ky": "ky",
    "en": "en",
}

TRANSLATION_LEXICON: List[dict] = [
    {"az": "salam", "tr": "merhaba", "kk": "сәлем", "uz": "salom", "tk": "salam", "ky": "салам", "en": "hello"},
    {"az": "sabahınız xeyir", "tr": "günaydın", "kk": "қайырлы таң", "uz": "xayrli tong", "tk": "ertiriňiz haýyrly", "ky": "күнүңүз жарык", "en": "good morning"},
    {"az": "təşəkkür edirəm", "tr": "teşekkür ederim", "kk": "рақмет", "uz": "rahmat", "tk": "sag bol", "ky": "рахмат", "en": "thank you"},
    {"az": "xoş gəlmisiniz", "tr": "hoş geldiniz", "kk": "қош келдіңіз", "uz": "xush kelibsiz", "tm": "hoş geldiňiz", "ky": "кош келиңиз", "en": "welcome"},
    {"az": "bəli", "tr": "evet", "kk": "иә", "uz": "ha", "tm": "hawa", "ky": "ооба", "en": "yes"},
    {"az": "xeyr", "tr": "hayır", "kk": "жоқ", "uz": "yo'q", "tm": "ýok", "ky": "жок", "en": "no"},
    {"az": "dost", "tr": "arkadaş", "kk": "дос", "uz": "do'st", "tm": "dost", "ky": "дос", "en": "friend"},
    {"az": "gənc", "tr": "genç", "kk": "жас", "uz": "yosh", "tm": "ýaş", "ky": "жаш", "en": "young"},
    {"az": "gənclər", "tr": "gençler", "kk": "жастар", "uz": "yoshlar", "tm": "ýaşlar", "ky": "жаштар", "en": "youth"},
    {"az": "layihə", "tr": "proje", "kk": "жоба", "uz": "loyiha", "tm": "taslama", "ky": "долбоор", "en": "project"},
    {"az": "komanda", "tr": "takım", "kk": "команда", "uz": "jamoa", "tm": "topar", "ky": "команда", "en": "team"},
    {"az": "dil", "tr": "dil", "kk": "тіл", "uz": "til", "tm": "dil", "ky": "тил", "en": "language"},
    {"az": "dünya", "tr": "dünya", "kk": "әлем", "uz": "dunyo", "tm": "dünýä", "ky": "дүйнө", "en": "world"},
    {"az": "gələcək", "tr": "gelecek", "kk": "болашақ", "uz": "kelajak", "tm": "geljek", "ky": "келечек", "en": "future"},
    {"az": "birlik", "tr": "birlik", "kk": "бірлік", "uz": "birlik", "tm": "birlik", "ky": "биримдик", "en": "unity"},
    {"az": "birlikdə", "tr": "birlikte", "kk": "бірге", "uz": "birga", "tm": "bile", "ky": "бирге", "en": "together"},
    {"az": "bu gün", "tr": "bugün", "kk": "бүгін", "uz": "bugun", "tm": "şu gün", "ky": "бүгүн", "en": "today"},
    {"az": "sabah", "tr": "yarın", "kk": "ертең", "uz": "ertaga", "tm": "ertir", "ky": "эртең", "en": "tomorrow"},
    {"az": "xəbər", "tr": "haber", "kk": "жаңалық", "uz": "yangilik", "tm": "habar", "ky": "жаңылык", "en": "news"},
    {"az": "iş", "tr": "iş", "kk": "жұмыс", "uz": "ish", "tm": "iş", "ky": "иш", "en": "work"},
    {"az": "tələbə", "tr": "öğrenci", "kk": "студент", "uz": "talaba", "tm": "okuwçy", "ky": "студент", "en": "student"},
    {"az": "universitet", "tr": "üniversite", "kk": "университет", "uz": "universitet", "tm": "uniwersitet", "ky": "университет", "en": "university"},
    {"az": "texnologiya", "tr": "teknoloji", "kk": "технология", "uz": "texnologiya", "tm": "tehnologiýa", "ky": "технология", "en": "technology"},
    {"az": "süni intellekt", "tr": "yapay zeka", "kk": "жасанды интеллект", "uz": "sun'iy intellekt", "tm": "emeli akyl", "ky": "жасалма интеллект", "en": "artificial intelligence"},
    {"az": "tərcümə", "tr": "çeviri", "kk": "аударма", "uz": "tarjima", "tm": "terjime", "ky": "котормо", "en": "translation"},
    {"az": "lüğət", "tr": "sözlük", "kk": "сөздік", "uz": "lug'at", "tm": "sözlük", "ky": "сөздүк", "en": "dictionary"},
    {"az": "axtarış", "tr": "arama", "kk": "іздеу", "uz": "qidiruv", "tm": "gözleg", "ky": "издөө", "en": "search"},
    {"az": "qoşul", "tr": "katıl", "kk": "қосыл", "uz": "qo'shil", "tm": "goşul", "ky": "кошул", "en": "join"},
    {"az": "paylaş", "tr": "paylaş", "kk": "бөліс", "uz": "ulash", "tm": "paýlaş", "ky": "бөлүш", "en": "share"},
    {"az": "bəyən", "tr": "beğen", "kk": "ұнату", "uz": "yoqtir", "tm": "hala", "ky": "жактыр", "en": "like"},
    {"az": "şərh", "tr": "yorum", "kk": "пікір", "uz": "izoh", "tm": "teswir", "ky": "пикир", "en": "comment"},
    {"az": "mesaj", "tr": "mesaj", "kk": "хабарлама", "uz": "xabar", "tm": "habar", "ky": "билдирүү", "en": "message"},
    {"az": "profil", "tr": "profil", "kk": "профиль", "uz": "profil", "tm": "profil", "ky": "профиль", "en": "profile"},
    {"az": "ayarlar", "tr": "ayarlar", "kk": "параметрлер", "uz": "sozlamalar", "tm": "sazlamalar", "ky": "жөндөөлөр", "en": "settings"},
    {"az": "orijinal", "tr": "orijinal", "kk": "түпнұсқа", "uz": "asl", "tm": "asyl", "ky": "түпнуска", "en": "original"},
    {"az": "tərcümə olunub", "tr": "çevrildi", "kk": "аударылды", "uz": "tarjima qilindi", "tm": "terjime edildi", "ky": "которулду", "en": "translated"},
    {"az": "canlı", "tr": "canlı", "kk": "тікелей", "uz": "jonli", "tm": "janly", "ky": "түз эфир", "en": "live"},
    {"az": "onlayn", "tr": "çevrimiçi", "kk": "онлайн", "uz": "onlayn", "tm": "onlaýn", "ky": "онлайн", "en": "online"},
    {"az": "oflayn", "tr": "çevrimdışı", "kk": "офлайн", "uz": "oflayn", "tm": "oflaýn", "ky": "офлайн", "en": "offline"},
    {"az": "bağlanılır", "tr": "bağlanıyor", "kk": "қосылуда", "uz": "ulanmoqda", "tm": "birikdirilýär", "ky": "туташууда", "en": "connecting"},
    {"az": "bağlantı kəsildi", "tr": "bağlantı kesildi", "kk": "байланыс үзілді", "uz": "aloqa uzildi", "tm": "baglanyşyk üzüldi", "ky": "байланыш үзүлдү", "en": "connection lost"},
    {"az": "yenidən qoşulur", "tr": "yeniden bağlanıyor", "kk": "қайта қосылуда", "uz": "qayta ulanmoqda", "tm": "täzeden birikdirilýär", "ky": "кайра туташууда", "en": "reconnecting"},
    {"az": "pantürk", "tr": "pan-türk", "kk": "пантүрік", "uz": "panturkiy", "tm": "pantürk", "ky": "пантүрк", "en": "pan-turkic"},
    {"az": "göytürk", "tr": "göktürk", "kk": "көктүрік", "uz": "ko'kturk", "tm": "göktürk", "ky": "көктүрк", "en": "gokturk"},
    {"az": "yenilik", "tr": "yenilik", "kk": "жаңалық", "uz": "yangilik", "tm": "täzelik", "ky": "жаңылык", "en": "innovation"},
    {"az": "rəqəmsal", "tr": "dijital", "kk": "цифрлық", "uz": "raqamli", "tm": "sanly", "ky": "санариптик", "en": "digital"},
    {"az": "məkan", "tr": "mekan", "kk": "кеңістік", "uz": "maydon", "tm": "giňişlik", "ky": "мейкиндик", "en": "space"},
    {"az": "gələcəyə", "tr": "geleceğe", "kk": "болашаққа", "uz": "kelajakka", "tm": "geljege", "ky": "келечекке", "en": "to the future"},
    {"az": "komandaya qoşul", "tr": "takıma katıl", "kk": "командаға қосыл", "uz": "jamoaga qo'shil", "tm": "topara goşul", "ky": "командага кошул", "en": "join the team"},
    {"az": "yeni layihə", "tr": "yeni proje", "kk": "жаңа жоба", "uz": "yangi loyiha", "tm": "täze taslama", "ky": "жаңы долбоор", "en": "new project"},
    {"az": "türk dövlətləri", "tr": "türk devletleri", "kk": "түрік мемлекеттері", "uz": "turkiy davlatlar", "tm": "türk döwletleri", "ky": "түрк мамлекеттери", "en": "turkic states"},
]


def normalize_translation_lang(code: Optional[str]) -> str:
    value = (code or "").strip().lower()
    return TRANSLATION_LANG_ALIASES.get(value, value)


def detect_translation_lang(raw: str) -> str:
    text = raw.lower()
    scores = {lang: 0 for lang in SUPPORTED_TRANSLATION_LANGS}

    for entry in TRANSLATION_LEXICON:
        for lang, term in entry.items():
            if not term:
                continue
            lang = normalize_translation_lang(lang)
            if lang not in scores:
                continue
            if re.search(r"(?<!\w)" + re.escape(term.lower()) + r"(?!\w)", text):
                scores[lang] += max(1, len(term.split()))

    if "ə" in text:
        scores["az"] += 3
    if any(ch in text for ch in "әғқңөұүһі"):
        scores["kk"] += 3
    if any(ch in text for ch in "ңөү"):
        scores["ky"] += 2
    if any(ch in text for ch in "äňşçöüýž"):
        scores["tk"] += 2
    if any(ch in text for ch in "ʻ‘ʼ"):
        scores["uz"] += 1
    if re.search(r"\b(the|and|is|are|you|we|this|that|with|for|from|have)\b", text):
        scores["en"] += 2

    best_lang = max(scores, key=scores.get)
    return best_lang if scores[best_lang] > 0 else "az"


def _external_translate_sync(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    api_url = os.getenv("TRANSLATE_API_URL")
    api_key = os.getenv("TRANSLATE_API_KEY")
    if not api_url or not api_key:
        return None

    payload = json.dumps(
        {
            "model": os.getenv("TRANSLATE_MODEL", "gpt-4o-mini"),
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a precise translator for Turkic languages. "
                        f"Translate the user text from {source_lang} to {target_lang}. "
                        "Return only the translation. Preserve emojis, hashtags, URLs, line breaks, "
                        "mentions, and formatting exactly; translate the complete meaning naturally, "
                        "not word by word."
                    ),
                },
                {"role": "user", "content": text},
            ],
            "temperature": 0.2,
        }
    ).encode("utf-8")

    request = urllib_request.Request(
        api_url,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (TurkHub/1.0)",
        },
        method="POST",
    )
    with urllib_request.urlopen(request, timeout=8) as response:
        data = json.loads(response.read().decode("utf-8"))

    if isinstance(data, dict):
        if isinstance(data.get("translated_text"), str):
            return data["translated_text"].strip()
        if isinstance(data.get("translation"), str):
            return data["translation"].strip()
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message", {})
            content = message.get("content")
            if isinstance(content, str):
                return content.strip()
    return None


def _google_translate_sync(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    google_target = TRANSLATION_PROVIDER_CODES.get(target_lang, target_lang)
    query = urllib_parse.urlencode(
        {
            "client": "gtx",
            "sl": "auto",
            "tl": google_target,
            "dt": "t",
            "q": text,
        }
    )
    request = urllib_request.Request(
        f"https://translate.googleapis.com/translate_a/single?{query}",
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json,text/javascript,*/*;q=0.01",
            "Accept-Language": "az,en;q=0.9,tr;q=0.8",
            "Referer": "https://translate.google.com/",
        },
        method="GET",
    )
    ssl_context = ssl.create_default_context()
    with urllib_request.urlopen(request, timeout=10, context=ssl_context) as response:
        data = json.loads(response.read().decode("utf-8"))
    segments = data[0] if isinstance(data, list) and data and isinstance(data[0], list) else []
    translated_parts = []
    for segment in segments:
        if not isinstance(segment, list) or not segment:
            continue
        value = segment[0]
        if isinstance(value, str):
            translated_parts.append(value)
    translated = "".join(translated_parts).strip()
    if translated and translated.strip() == text.strip():
        return None
    return translated or None


def _mymemory_translate_sync(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    source = "auto" if not source_lang else TRANSLATION_PROVIDER_CODES.get(source_lang, "auto")
    target = TRANSLATION_PROVIDER_CODES.get(target_lang, target_lang)
    query = urllib_parse.urlencode({"q": text, "langpair": f"{source}|{target}"})
    request = urllib_request.Request(
        f"https://api.mymemory.translated.net/get?{query}",
        headers={"User-Agent": "Mozilla/5.0 (TurkHub/1.0)"},
        method="GET",
    )
    with urllib_request.urlopen(request, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
    response_data = data.get("responseData", {}) if isinstance(data, dict) else {}
    translated = response_data.get("translatedText") if isinstance(response_data, dict) else None
    return translated.strip() if isinstance(translated, str) else None


async def external_translate(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    try:
        google_result = await asyncio.to_thread(
            _google_translate_sync,
            text,
            source_lang,
            target_lang,
        )
        if google_result and google_result.strip() != text.strip():
            return google_result.strip()
    except Exception as exc:
        logger.warning("Google translation fallback failed: %s", exc)
    try:
        mymemory_result = await asyncio.to_thread(
            _mymemory_translate_sync,
            text,
            source_lang,
            target_lang,
        )
        if mymemory_result and mymemory_result.strip() != text.strip():
            return mymemory_result.strip()
    except Exception as exc:
        logger.warning("MyMemory translation fallback failed: %s", exc)
    try:
        llm_result = await asyncio.to_thread(
            _external_translate_sync,
            text,
            source_lang,
            target_lang,
        )
        if llm_result and llm_result.strip() != text.strip():
            return llm_result.strip()
    except Exception as exc:
        logger.warning("LLM translation provider failed: %s", exc)
    return None
