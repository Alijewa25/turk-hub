from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from database import SessionLocal, engine
import models


PAN_TURKIC_WORDS = [
    {
        "word": "su",
        "proto_root": "*sub / *su",
        "az": "su",
        "tr": "su",
        "kk": "су",
        "uz": "suv",
        "tm": "suw",
        "ky": "суу",
        "ug": "سۇ",
        "etymology": "Qədim Türk dillərində həyat mənbəyi sayılan əsas leksik vahid. Orxon-Yenisey abidələrində 'sub' formasında təsadüf olunur.",
    },
    {
        "word": "təngri / tengri",
        "proto_root": "*teŋri",
        "az": "Tanrı",
        "tr": "Tanrı",
        "kk": "Тәңірі",
        "uz": "Tangri",
        "tm": "Taňry",
        "ky": "Теңир",
        "ug": "تەڭرى",
        "etymology": "Qədim Türk inancında səma, ilahi qüvvə və yaradıcı mənasını verir. Göytürk yazılarında 'Tengri' kimi geniş istifadə olunub.",
    },
    {
        "word": "yoldaş",
        "proto_root": "*yoldaš",
        "az": "yoldaş",
        "tr": "yoldaş",
        "kk": "жолдас",
        "uz": "yo'ldosh",
        "tm": "ýoldaş",
        "ky": "жолдош",
        "ug": "يولداش",
        "etymology": "'Yol' kökündən yaranaraq eyni yolda gedən, səfər yoldaşı və ümumi məqsəd üçün birləşən şəxs mənasını daşıyır.",
    },
    {
        "word": "el",
        "proto_root": "*el",
        "az": "el",
        "tr": "el",
        "kk": "ел",
        "uz": "el",
        "tm": "il",
        "ky": "эл",
        "ug": "ئەل",
        "etymology": "Türk dövlət ənənəsində xalq, ölkə və idarə olunan ərazi anlayışlarını birləşdirən fundamental siyasi-sosial termin.",
    },
    {
        "word": "qut",
        "proto_root": "*qut",
        "az": "qut",
        "tr": "kut",
        "kk": "құт",
        "uz": "qut",
        "tm": "gut",
        "ky": "кут",
        "ug": "قۇت",
        "etymology": "Qədim Türk dövlət ideologiyasında hökmdarın ilahi seçilmişliyini, bərəkət və uğuru bildirən anlayış. 'Qutluq' forması da geniş yayılıb.",
    },
    {
        "word": "bilig",
        "proto_root": "*bilig",
        "az": "bilik",
        "tr": "bilgi",
        "kk": "білім",
        "uz": "bilim",
        "tm": "bilim",
        "ky": "билим",
        "ug": "بىلىم",
        "etymology": "'Bilmək' feli kökündən törəyən bilig, qədim Türk mətnlərində elm, idrak və müdriklik mənasında işlədilib.",
    },
    {
        "word": "yol",
        "proto_root": "*yol",
        "az": "yol",
        "tr": "yol",
        "kk": "жол",
        "uz": "yo'l",
        "tm": "ýol",
        "ky": "жол",
        "ug": "يول",
        "etymology": "Həm fiziki marşrut, həm də həyat tərzi, üsul və mənəvi istiqamət mənalarını daşıyan ortaq Türk kökü.",
    },
    {
        "word": "göy",
        "proto_root": "*kök",
        "az": "göy",
        "tr": "gök",
        "kk": "көк",
        "uz": "ko'k",
        "tm": "gök",
        "ky": "көк",
        "ug": "كۆك",
        "etymology": "Səma və mavi rəngi bildirən kök. Türk kosmologiyasında göy Tanrı ilə əlaqələndirilən müqəddəs anlayışlardan biridir.",
    },
    {
        "word": "yer",
        "proto_root": "*yer",
        "az": "yer",
        "tr": "yer",
        "kk": "жер",
        "uz": "yer",
        "tm": "ýer",
        "ky": "жер",
        "ug": "يەر",
        "etymology": "Torpaq, məkan və yurd mənasını verən qədim Türk sözü. Göy-yer cütlüyü ənənəvi Türk dünyagörüşünün əsasını təşkil edir.",
    },
    {
        "word": "at",
        "proto_root": "*at",
        "az": "at",
        "tr": "at",
        "kk": "ат",
        "uz": "ot",
        "tm": "at",
        "ky": "ат",
        "ug": "ئات",
        "etymology": "Türk köçəri həyatının simvolu olan at, qədim dövrlərdən hərbi, iqtisadi və mədəni həyatda mərkəzi yer tutub.",
    },
    {
        "word": "ana",
        "proto_root": "*ana",
        "az": "ana",
        "tr": "anne",
        "kk": "ана",
        "uz": "ona",
        "tm": "ene",
        "ky": "эне",
        "ug": "ئانا",
        "etymology": "Bütün Türk dillərində qohumluq əlaqəsini bildirən ən qədim və sabit leksik qatlardan biri.",
    },
    {
        "word": "ata",
        "proto_root": "*ata",
        "az": "ata",
        "tr": "ata",
        "kk": "ата",
        "uz": "ota",
        "tm": "ata",
        "ky": "ата",
        "ug": "ئاتا",
        "etymology": "Ailə başçısı, baba və əcdad mənasını daşıyır. Türk dövlət ənənəsində 'ata' hörmət və davamlılıq simvoludur.",
    },
    {
        "word": "kün",
        "proto_root": "*kün",
        "az": "gün",
        "tr": "gün",
        "kk": "күн",
        "uz": "kun",
        "tm": "gün",
        "ky": "күн",
        "ug": "كۈن",
        "etymology": "Günəş və gün mənasını verir. Qədim təqvim və zaman hesablamalarında əsas vahid kimi istifadə olunub.",
    },
    {
        "word": "ay",
        "proto_root": "*āy",
        "az": "ay",
        "tr": "ay",
        "kk": "ай",
        "uz": "oy",
        "tm": "aý",
        "ky": "ай",
        "ug": "ئاي",
        "etymology": "Həm göy cismi, həm də zaman ölçüsü mənasını daşıyır. Qədim Türk təqvimində Ay dövrləri mühüm rol oynayıb.",
    },
    {
        "word": "yulduz",
        "proto_root": "*yulduz",
        "az": "ulduz",
        "tr": "yıldız",
        "kk": "жұлдыз",
        "uz": "yulduz",
        "tm": "ýyldyz",
        "ky": "жылдыз",
        "ug": "يۇلتۇز",
        "etymology": "Göy cisimlərini bildirən söz. Qədim Türk astronomiyası və mifologiyasında istiqamət və taleyin göstəricisi sayılıb.",
    },
    {
        "word": "ot",
        "proto_root": "*ot",
        "az": "od",
        "tr": "od / ateş",
        "kk": "от",
        "uz": "o't",
        "tm": "ot",
        "ky": "от",
        "ug": "ئوت",
        "etymology": "Atəş və alov mənasını verən qədim Türk kökü. Ocaq, ailə və müqəddəslik anlayışları ilə sıx bağlıdır.",
    },
    {
        "word": "dağ",
        "proto_root": "*tāg",
        "az": "dağ",
        "tr": "dağ",
        "kk": "тау",
        "uz": "tog'",
        "tm": "dag",
        "ky": "тоо",
        "ug": "تاغ",
        "etymology": "Yüksək relyef formasını bildirir. Türk mifologiyasında dağlar müqəddəs məkan və dövlət simvolu kimi qəbul edilib.",
    },
    {
        "word": "dəniz",
        "proto_root": "*teŋiz",
        "az": "dəniz",
        "tr": "deniz",
        "kk": "теңіз",
        "uz": "dengiz",
        "tm": "deňiz",
        "ky": "деңиз",
        "ug": "دېڭىز",
        "etymology": "Böyük su hövzəsi mənasını verən ortaq Türk sözü. Səfər, ticarət və dənizçilik terminologiyasında geniş istifadə olunub.",
    },
    {
        "word": "dil",
        "proto_root": "*dïl",
        "az": "dil",
        "tr": "dil",
        "kk": "тіл",
        "uz": "til",
        "tm": "dil",
        "ky": "тил",
        "ug": "تىل",
        "etymology": "Həm bədən üzvü, həm də ünsiyyət sistemi mənasını daşıyır. Türk dillərinin ortaq mənşəyini göstərən əsas sözlərdəndir.",
    },
    {
        "word": "söz",
        "proto_root": "*söz",
        "az": "söz",
        "tr": "söz",
        "kk": "сөз",
        "uz": "so'z",
        "tm": "söz",
        "ky": "сөз",
        "ug": "سۆز",
        "etymology": "Nitq, ifadə və vəd mənalarını birləşdirən qədim Türk leksemi. Yazılı abidələrdə 'sab' və 'söz' formaları ilə qarşılaşırıq.",
    },
    {
        "word": "güc",
        "proto_root": "*güč",
        "az": "güc",
        "tr": "güç",
        "kk": "күш",
        "uz": "kuch",
        "tm": "güýç",
        "ky": "күч",
        "ug": "كۈچ",
        "etymology": "Fiziki qüvvə, təsir və qüdrət mənasını verir. Dövlət və hərbi terminologiyada geniş istifadə olunub.",
    },
    {
        "word": "birlik",
        "proto_root": "*birlik",
        "az": "birlik",
        "tr": "birlik",
        "kk": "бірлік",
        "uz": "birlik",
        "tm": "birlik",
        "ky": "биримдик",
        "ug": "بىرلىك",
        "etymology": "'Bir' kökündən törəyən birlik, həmrəylik və vahidlik anlayışını ifadə edir. Pan-Türk ideyalarında əsas anlayışlardan biridir.",
    },
    {
        "word": "gələcək",
        "proto_root": "*kel(e)ček",
        "az": "gələcək",
        "tr": "gelecek",
        "kk": "болашақ",
        "uz": "kelajak",
        "tm": "geljek",
        "ky": "келечек",
        "ug": "كەلگۈسى",
        "etymology": "'Gəlmək' feli əsasında yaranan zaman anlayışı. Müasir Türk dillərində müxtəlif fonetik formalarda yaşayır.",
    },
    {
        "word": "barış",
        "proto_root": "*barïš",
        "az": "sülh / barış",
        "tr": "barış",
        "kk": "бейбітшілік",
        "uz": "tinchlik",
        "tm": "parahatçylyk",
        "ky": "тынчтык",
        "ug": "تىنچلىق",
        "etymology": "'Bar-' kökü ilə əlaqəli olan barış, razılıq, sülh və birgə yaşayış mənasını ifadə edir.",
    },
    {
        "word": "tamga",
        "proto_root": "*tamga",
        "az": "damğa",
        "tr": "damga",
        "kk": "таңба",
        "uz": "tamg'a",
        "tm": "tamga",
        "ky": "тамга",
        "ug": "تامغا",
        "etymology": "Möhür, nişan və aidiyyət işarəsi. Qədim Türk tayfaları mal-qaranı və əraziləri tamga ilə qeyd edirdilər.",
    },
    {
        "word": "ordu",
        "proto_root": "*ordu",
        "az": "ordu",
        "tr": "ordu",
        "kk": "орда",
        "uz": "o'rda",
        "tm": "orda",
        "ky": "ордо",
        "ug": "ئوردا",
        "etymology": "Hərbi qüvvə və hökmdarın düşərgəsi mənasını verir. 'Orda' forması sonralar siyasi qurum adına çevrilib.",
    },
    {
        "word": "ulus",
        "proto_root": "*uluš",
        "az": "ulus",
        "tr": "ulus",
        "kk": "ұлыс",
        "uz": "elat",
        "tm": "halk",
        "ky": "улус",
        "ug": "ئۇلۇس",
        "etymology": "Xalq, tayfa birliyi və dövlət quruluşu mənasında istifadə olunub. Monqol və Türk idarəçilik ənənələrində geniş yayılıb.",
    },
]


def ensure_schema_columns(bind=None) -> None:
    """Add newly introduced nullable columns to existing SQLite/PostgreSQL tables."""
    target = bind or engine
    try:
        inspector = inspect(target)
        existing_tables = set(inspector.get_table_names())
    except Exception as exc:
        print(f"Schema inspection skipped: {exc}")
        return

    for table in models.Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        try:
            existing = {
                column["name"] for column in inspector.get_columns(table.name)
            }
        except Exception as exc:
            print(f"Could not inspect {table.name} columns: {exc}")
            continue

        for column in table.columns:
            if column.primary_key or column.name in existing:
                continue
            if (
                not column.nullable
                and column.default is None
                and column.server_default is None
            ):
                continue
            column_type = column.type.compile(dialect=target.dialect)
            statement = text(
                f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}'
            )
            try:
                with target.begin() as connection:
                    connection.execute(statement)
            except Exception as exc:
                print(f"Could not add {table.name}.{column.name}: {exc}")


def seed_dictionary(db: Session) -> int:
    """Upsert the Pan-Turkic dictionary seed without creating duplicates."""
    added = 0
    for item in PAN_TURKIC_WORDS:
        values = {
            "proto_root": item["proto_root"],
            "az_val": item["az"],
            "tr_val": item["tr"],
            "kk_val": item["kk"],
            "uz_val": item["uz"],
            "ky_val": item["ky"],
            "tm_val": item["tm"],
            "ug_val": item["ug"],
            "etymology_note": item["etymology"],
            "source": "Pan-Türk ortaq leksikonu",
            "approved": 1,
        }
        candidates = {
            item["word"].lower(),
            *(part.strip().lower() for part in item["word"].split("/")),
        }
        matches = (
            db.query(models.Dictionary)
            .filter(func.lower(models.Dictionary.root_concept).in_(candidates))
            .order_by(models.Dictionary.id)
            .all()
        )
        if matches:
            existing = matches[0]
            existing.root_concept = item["word"]
            for field, value in values.items():
                setattr(existing, field, value)
            for duplicate in matches[1:]:
                db.delete(duplicate)
        else:
            db.add(models.Dictionary(root_concept=item["word"], **values))
            added += 1

    db.commit()
    return added


def seed_data() -> None:
    models.Base.metadata.create_all(bind=engine)
    ensure_schema_columns()

    db = SessionLocal()
    try:
        added = seed_dictionary(db)
        print(
            f"Pan-Türk lüğəti hazırdır: {added} yeni söz əlavə edildi, "
            f"{len(PAN_TURKIC_WORDS)} söz yoxlanıldı. 🐺"
        )

        if not db.query(models.Project).first():
            sample_projects = [
                models.Project(
                    title="Türk Mədəniyyət Xəritəsi",
                    description="Türk xalqlarının tarixi abidələrini göstərən interaktiv rəqəmsal xəritə layihəsi.",
                    required_skills="React, LeafletJS, UI/UX",
                    owner_id=1,
                ),
                models.Project(
                    title="Ethno-Acoustic Synth",
                    description="Qədim Türk musiqi alətlərinin rəqəmsal səs nümunələrindən ibarət açıq kitabxana.",
                    required_skills="Python, Audio Processing, FastAPI",
                    owner_id=1,
                ),
            ]
            db.add_all(sample_projects)
            db.commit()
            print("Sınaq layihələri bazaya əlavə edildi! 🚀")
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()
