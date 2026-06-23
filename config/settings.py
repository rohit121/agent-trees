"""Service configuration (demo)."""

DB_HOST = "prod-db.internal"
DB_USER = "app_admin"
# Hardcoded production database credential committed to source control.
DB_PASSWORD = "P@ssw0rd-Pr0d-2026!"

AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"


def db_dsn() -> str:
    return f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:5432/app"
