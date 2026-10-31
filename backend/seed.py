from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

def seed_data():
    # Sözlük üçün sınaq dataları
    sample_words = [
        {
            "root_concept": "Bilig",
            "dialects": {
                "aze": "Bilik",
                "tur": "Bilgi",
                "kaz": "Bilim",
                "uzb": "Bilim",
                "kyg": "Bilim",
                "tkm": "Bilim",
            },
            "etymology_note": "Ortaq Türk kökündən gələn anlayış, 'bilmək' feəlindən yaranmışdır.",
        },
        {
            "root_concept": "Yol",
            "dialects": {
                "aze": "Yol",
                "tur": "Yol",
                "kaz": "Zhol",
                "uzb": "Yo'l",
                "kyg": "Jol",
                "tkm": "Yol",
            },
            "etymology_note": "Həm fiziki marşrut, həm də gedişat/üslub mənasında istifadə olunan ortaq kök söz.",
        },
        {
            "root_concept": "Su",
            "dialects": {
                "aze": "Su",
                "tur": "Su",
                "kaz": "Su",
                "uzb": "Suv",
                "kyg": "Suu",
                "tkm": "Suw",
            },
            "etymology_note": "Bütün Türk dillərində həyatın əsası olan elemental söz.",
        },
        {
            "root_concept": "Tengri",
            "dialects": {
                "aze": "Tanrı",
                "tur": "Tanrı",
                "kaz": "Tengri",
                "uzb": "Tengri",
                "kyg": "Tengir",
                "tkm": "Tengri",
            },
            "etymology_note": "Qədim Türk inanclarında səma və yaradıcı mənasını verən ortaq leksik vahid.",
        },
    ]

    for word in sample_words:
        values = {
            "az_val": word["dialects"]["aze"],
            "tr_val": word["dialects"]["tur"],
            "kk_val": word["dialects"]["kaz"],
            "uz_val": word["dialects"]["uzb"],
            "ky_val": word["dialects"]["kyg"],
            "tm_val": word["dialects"]["tkm"],
            "etymology_note": word["etymology_note"],
        }
        existing = db.query(models.Dictionary).filter(
            models.Dictionary.root_concept == word["root_concept"]
        ).first()
        if existing:
            for field, value in values.items():
                setattr(existing, field, value)
        else:
            db.add(models.Dictionary(root_concept=word["root_concept"], **values))

    print("Sınaq sözləri bazaya yeniləndi! 🐺")

    # Layihələr üçün sınaq dataları
    if not db.query(models.Project).first():
        sample_projects = [
            models.Project(
                title="Türk Mədəniyyət Xəritəsi",
                description="Türk xalqlarının tarixi abidələrini göstərən interaktiv rəqəmsal xəritə layihəsi.",
                required_skills="React, LeafletJS, UI/UX",
                owner_id=1
            ),
            models.Project(
                title="Ethno-Acoustic Synth",
                description="Qədim Türk musiqi alətlərinin rəqəmsal səs nümunələrindən ibarət açıq kitabxana.",
                required_skills="Python, Audio Processing, FastAPI",
                owner_id=1
            )
        ]
        db.add_all(sample_projects)
        print("Sınaq layihələri bazaya əlavə edildi! 🚀")

    db.commit()

if __name__ == "__main__":
    seed_data()
    db.close()