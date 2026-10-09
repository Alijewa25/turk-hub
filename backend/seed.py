from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

def seed_data():
    # Sözlük üçün sınaq dataları
    if not db.query(models.Dictionary).first():
        sample_words = [
            models.Dictionary(
                root_concept="Bilig",
                az_val="Bilik",
                tr_val="Bilgi",
                kk_val="Bilim",
                uz_val="Bilim",
                etymology_note="Ortaq Türk kökündən gələn anlayış, 'bilmək' feəlindən yaranmışdır."
            ),
            models.Dictionary(
                root_concept="Yol",
                az_val="Yol",
                tr_val="Yol",
                kk_val="Zhol",
                uz_val="Yo'l",
                etymology_note="Həm fiziki marşrut, həm də gedişat/üslub mənasında istifadə olunan ortaq kök söz."
            ),
            models.Dictionary(
                root_concept="Su",
                az_val="Su",
                tr_val="Su",
                kk_val="Su",
                uz_val="Suv",
                etymology_note="Bütün Türk dillərində həyatın əsası olan elemental söz."
            ),
            models.Dictionary(
                root_concept="Tengri",
                az_val="Tanrı",
                tr_val="Tanrı",
                kk_val="Tengri",
                uz_val="Tengri",
                etymology_note="Qədim Türk inanclarında səma və yaradıcı mənasını verən ortaq leksik vahid."
            ),
        ]
        db.add_all(sample_words)
        print("Sınaq sözləri bazaya əlavə edildi! 🐺")

    # Layihələr üçün sınaq dataları
    if not db.query(models.Project).first():
        sample_projects = [
            models.Project(
                title="Türk Mədəniyyət Xəritəsi",
                etymology_note="Türk xalqlarının tarixi abidələrini göstərən interaktiv rəqəmsal xəritə layihəsi.",
                required_skills="React, LeafletJS, UI/UX",
                owner_id=1
            ),
            models.Project(
                title="Ethno-Acoustic Synth",
                etymology_note="Qədim Türk musiqi alətlərinin rəqəmsal ses nümunələrindən ibarət açıq kitabxana.",
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