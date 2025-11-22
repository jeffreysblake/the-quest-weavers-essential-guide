---
name: sqlalchemy
requires_deps: ["sqlalchemy>=2.0"]
optional_deps: ["alembic"]
---

# SQLAlchemy ORM Patterns

SQLAlchemy 2.0+ provides powerful ORM capabilities with improved type safety.

## Model Definition

```python
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from datetime import datetime
from uuid import UUID, uuid4

class Base(DeclarativeBase):
    """Base class for all models."""
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    projects: Mapped[list["Project"]] = relationship(back_populates="owner")
```

## Session Management

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager

DATABASE_URL = "postgresql://user:pass@localhost/dbname"

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Session:
    """Dependency for FastAPI to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def get_db_context():
    """Context manager for database sessions."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```

## Query Patterns

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

def get_user_by_email(db: Session, email: str) -> User | None:
    """Get user by email."""
    stmt = select(User).where(User.email == email)
    return db.scalar(stmt)

def get_active_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    """Get paginated list of active users."""
    stmt = (
        select(User)
        .where(User.is_active == True)
        .offset(skip)
        .limit(limit)
    )
    return list(db.scalars(stmt))

def create_user(db: Session, user_data: dict) -> User:
    """Create new user."""
    user = User(**user_data)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
```

## Relationships

```python
class Project(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100))
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="projects")
    tasks: Mapped[list["Task"]] = relationship(back_populates="project", cascade="all, delete-orphan")

# Query with relationships
def get_user_with_projects(db: Session, user_id: UUID) -> User | None:
    """Get user with all projects loaded."""
    from sqlalchemy.orm import selectinload

    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.projects))
    )
    return db.scalar(stmt)
```

## Migrations with Alembic

```bash
# Initialize alembic
alembic init alembic

# Create migration
alembic revision --autogenerate -m "Add users table"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```
