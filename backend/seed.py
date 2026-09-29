from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

def seed_data():
    # Sözlük üçün sınaq dataları
    if not db.query(models.DictionaryWord).first():
        sample_words = [
            models.DictionaryWord(
                root_word="Bilig",
                az_word="Bilik",
                tr_word="Bilgi",
                kk_word="Bilim",
                uz_word="Bilim",
                description="Ortaq Türk kökündən gələn anlayış, 'bilmək' feəlindən yaranmışdır."
            ),
            models.DictionaryWord(
                root_word="Yol",
                az_word="Yol",
                tr_word="Yol",
                kk_word="Zhol",
                uz_word="Yo'l",
                description="Həm fiziki marşrut, həm də gedişat/üslub mənasında istifadə olunan ortaq kök söz."
            ),
            models.DictionaryWord(
                root_word="Su",
                az_word="Su",
                tr_word="Su",
                kk_word="Su",
                uz_word="Suv",
                description="Bütün Türk dillərində həyatın əsası olan elemental söz."
            ),
            models.DictionaryWord(
                root_word="Tengri",
                az_word="Tanrı",
                tr_word="Tanrı",
                kk_word="Tengri",
                uz_word="Tengri",
                description="Qədim Türk inanclarında səma və yaradıcı mənasını verən ortaq leksik vahid."
            ),
        ]
        db.add_all(sample_words)
        print("Sınaq sözləri bazaya əlavə edildi! 🐺")

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
                description="Qədim Türk musiqi alətlərinin rəqəmsal ses nümunələrindən ibarət açıq kitabxana.",
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