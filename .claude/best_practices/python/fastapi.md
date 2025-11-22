---
name: fastapi
requires_deps: ["fastapi>=0.100"]
optional_deps: ["sqlalchemy", "pydantic"]
---

# FastAPI Best Practices

## 1. Dependency Injection

Use FastAPI's dependency injection for reusable logic:

```python
# app/core/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import verify_token
from app.db.models import User

security = HTTPBearer()

async def get_current_user(
    token: str = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    payload = verify_token(token.credentials)
    if payload is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if user is None:
        raise credentials_exception
    return user

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
```

## 2. Pydantic Models (Schemas)

Define request/response schemas with validation:

```python
# app/api/v1/models/user.py
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from datetime import datetime
from uuid import UUID

class UserBase(BaseModel):
    """Base user schema with common fields."""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)

class UserCreate(UserBase):
    """Schema for user creation."""
    password: str = Field(..., min_length=12)

    @validator('password')
    def validate_password_complexity(cls, v: str) -> str:
        """Validate password meets complexity requirements."""
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain digit')
        return v

class UserResponse(UserBase):
    """Schema for user response (excludes sensitive data)."""
    id: UUID
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True  # Pydantic V2 (was orm_mode in V1)
```

## 3. Route Handlers

Organize routes with clear documentation:

```python
# app/api/v1/endpoints/users.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.v1.models.user import UserCreate, UserResponse
from app.db.session import get_db
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db)
) -> UserResponse:
    """
    Create a new user.

    - **email**: Valid email address (unique)
    - **username**: 3-50 characters (unique)
    - **password**: Minimum 12 characters with complexity requirements
    """
    service = UserService(db)

    # Check if user exists
    if service.get_by_email(user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    try:
        user = service.create_user(user_data)
        return UserResponse.from_orm(user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
```

## 4. Service Layer (Business Logic)

Separate business logic from route handlers:

```python
# app/services/user_service.py
from sqlalchemy.orm import Session
from app.db.models import User
from app.api/v1/models.user import UserCreate
from app.core.security import hash_password
from typing import Optional
from uuid import UUID

class UserService:
    """User business logic service."""

    def __init__(self, db: Session):
        self.db = db

    def create_user(self, user_data: UserCreate) -> User:
        """Create new user with password hashing."""
        user = User(
            email=user_data.email,
            username=user_data.username,
            password_hash=hash_password(user_data.password),
            role="user",
            is_active=True
        )

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        return user

    def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        return self.db.query(User).filter(User.email == email).first()
```
