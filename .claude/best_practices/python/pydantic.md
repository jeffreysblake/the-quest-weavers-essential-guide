---
name: pydantic
requires_deps: ["pydantic>=2.0"]
---

# Pydantic Schema Validation

Pydantic provides runtime data validation and schema definition. Essential for FastAPI and data validation.

## Basic Schema Definition

```python
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from datetime import datetime
from uuid import UUID

class UserBase(BaseModel):
    """Base user schema with common fields."""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    first_name: str
    last_name: str

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

## Field Validation

```python
from pydantic import BaseModel, Field, field_validator

class ProductSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0, description="Price must be positive")
    quantity: int = Field(default=0, ge=0)

    @field_validator('price')
    @classmethod
    def price_must_have_two_decimals(cls, v: float) -> float:
        """Ensure price has at most 2 decimal places."""
        if round(v, 2) != v:
            raise ValueError('Price must have at most 2 decimal places')
        return v
```

## Model Configuration

```python
class UserConfig(BaseModel):
    """Configuration with custom settings."""
    api_key: str
    timeout: int = Field(default=30, ge=1, le=300)

    class Config:
        # Pydantic V2 settings
        from_attributes = True      # Allow ORM mode
        populate_by_name = True     # Allow field population by alias
        str_strip_whitespace = True # Strip whitespace from strings
        validate_assignment = True  # Validate on assignment
```

## Pydantic V2 Migration Notes

- `orm_mode = True` → `from_attributes = True`
- `@validator` → `@field_validator` (with `@classmethod`)
- `allow_population_by_field_name` → `populate_by_name`
