---
name: pytest
requires_deps: ["pytest", "pytest-cov"]
---

# pytest Testing Patterns

## Coverage Requirements

- Minimum: {{COVERAGE_BACKEND}}% overall coverage
- Critical paths (auth, payments, data integrity): 95%+

## Test Structure

Organize tests to mirror your application structure:

```python
# tests/test_auth.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

class TestAuthEndpoints:
    """Test authentication endpoints."""

    def test_login_success(self, test_user):
        """Test successful login returns JWT token."""
        response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "SecurePass123!"}
        )
        assert response.status_code == 200
        assert "access_token" in response.json()
        assert response.json()["token_type"] == "bearer"

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401."""
        response = client.post(
            "/api/auth/login",
            json={"username": "fake", "password": "wrong"}
        )
        assert response.status_code == 401
        assert "detail" in response.json()
```

## Fixtures (conftest.py)

Create reusable test fixtures:

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.models import Base, User
from app.core.security import hash_password

@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)

@pytest.fixture
def test_user(db_session):
    """Create a test user."""
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("SecurePass123!"),
        role="user"
    )
    db_session.add(user)
    db_session.commit()
    return user
```
