"""
Authentication Routes
User registration, login, and profile management.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
import hashlib
import secrets
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query, execute_write

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ============ Models ============

class RegisterRequest(BaseModel):
    """User registration request."""
    name: str
    email: str
    phone: Optional[str] = None
    password: str
    age: Optional[int] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None


class LoginRequest(BaseModel):
    """User login request."""
    email: str
    password: str


class UpdateProfileRequest(BaseModel):
    """Update profile request."""
    name: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    notification_enabled: Optional[bool] = None
    preferences: Optional[Dict[str, Any]] = None
    profile_completed: Optional[bool] = None


class UserResponse(BaseModel):
    """User response model."""
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    notification_enabled: bool = True
    profile_completed: bool = False


class AuthResponse(BaseModel):
    """Authentication response with session token."""
    user: UserResponse
    session_token: str
    message: str


# ============ Helper Functions ============

def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt."""
    # Use a simple hash for demo (in production, use bcrypt)
    salt = "mediloon_salt_2026"
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def generate_session_token() -> str:
    """Generate a secure session token."""
    return secrets.token_urlsafe(32)


async def get_user_by_token(session_token: str) -> Optional[Dict[str, Any]]:
    """Get user from session token."""
    result = await execute_query("""
        SELECT c.id, c.name, c.email, c.phone, c.age, c.gender, c.address, c.city, c.state, c.postal_code, c.country, c.notification_enabled, c.profile_completed
        FROM customers c
        JOIN user_sessions s ON c.id = s.user_id
        WHERE s.session_token = ? AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    """, (session_token,))
    
    if result:
        return dict(result[0])
    return None


# ============ Routes ============

@router.post("/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    """Register a new user."""
    # Check if email already exists
    existing = await execute_query(
        "SELECT id FROM customers WHERE email = ?",
        (request.email.lower(),)
    )
    
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    password_hash = hash_password(request.password)
    
    # Create user
    profile_completed = all([request.age, request.gender, request.address])
    user_id = await execute_write("""
        INSERT INTO customers (name, email, phone, age, gender, address, city, state, postal_code, country, password_hash, notification_enabled, profile_completed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    """, (request.name, request.email.lower(), request.phone, request.age, request.gender, request.address, request.city, request.state, request.postal_code, request.country or 'Germany', password_hash, 1 if profile_completed else 0))
    
    # Create session
    session_token = generate_session_token()
    await execute_write("""
        INSERT INTO user_sessions (user_id, session_token, expires_at)
        VALUES (?, ?, datetime('now', '+30 days'))
    """, (user_id, session_token))
    
    return AuthResponse(
        user=UserResponse(
            id=user_id,
            name=request.name,
            email=request.email.lower(),
            phone=request.phone,
            age=request.age,
            gender=request.gender,
            address=request.address,
            city=request.city,
            state=request.state,
            postal_code=request.postal_code,
            country=request.country or 'Germany',
            notification_enabled=True,
            profile_completed=profile_completed,
        ),
        session_token=session_token,
        message="Registration successful",
    )


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    """Login user and get session token."""
    password_hash = hash_password(request.password)
    
    # Find user
    result = await execute_query("""
        SELECT id, name, email, phone, age, gender, address, city, state, postal_code, country, notification_enabled, profile_completed
        FROM customers
        WHERE email = ? AND password_hash = ?
    """, (request.email.lower(), password_hash))
    
    if not result:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user = result[0]
    
    # Create new session
    session_token = generate_session_token()
    await execute_write("""
        INSERT INTO user_sessions (user_id, session_token, expires_at)
        VALUES (?, ?, datetime('now', '+30 days'))
    """, (user['id'], session_token))
    
    return AuthResponse(
        user=UserResponse(
            id=user['id'],
            name=user['name'],
            email=user['email'],
            phone=user['phone'],
            age=user.get('age'),
            gender=user.get('gender'),
            address=user.get('address'),
            city=user.get('city'),
            state=user.get('state'),
            postal_code=user.get('postal_code'),
            country=user.get('country'),
            notification_enabled=bool(user['notification_enabled']),
            profile_completed=bool(user.get('profile_completed', False)),
        ),
        session_token=session_token,
        message="Login successful",
    )


@router.post("/logout")
async def logout(session_token: str):
    """Logout user and invalidate session."""
    await execute_write(
        "DELETE FROM user_sessions WHERE session_token = ?",
        (session_token,)
    )
    return {"status": "logged_out", "message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_profile(session_token: str):
    """Get current user profile."""
    user = await get_user_by_token(session_token)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    return UserResponse(**user)


@router.put("/me", response_model=UserResponse)
async def update_profile(session_token: str, request: UpdateProfileRequest):
    """Update user profile."""
    user = await get_user_by_token(session_token)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    # Build update query
    updates = []
    params = []
    
    if request.name is not None:
        updates.append("name = ?")
        params.append(request.name)
    
    if request.phone is not None:
        updates.append("phone = ?")
        params.append(request.phone)
    
    if request.age is not None:
        updates.append("age = ?")
        params.append(request.age)
    
    if request.gender is not None:
        updates.append("gender = ?")
        params.append(request.gender)
    
    if request.address is not None:
        updates.append("address = ?")
        params.append(request.address)
    
    if request.city is not None:
        updates.append("city = ?")
        params.append(request.city)
    
    if request.state is not None:
        updates.append("state = ?")
        params.append(request.state)
    
    if request.postal_code is not None:
        updates.append("postal_code = ?")
        params.append(request.postal_code)
    
    if request.country is not None:
        updates.append("country = ?")
        params.append(request.country)
    
    if request.notification_enabled is not None:
        updates.append("notification_enabled = ?")
        params.append(1 if request.notification_enabled else 0)
    
    if request.profile_completed is not None:
        updates.append("profile_completed = ?")
        params.append(1 if request.profile_completed else 0)
    
    if updates:
        params.append(user['id'])
        await execute_write(
            f"UPDATE customers SET {', '.join(updates)} WHERE id = ?",
            tuple(params)
        )
    
    # Get updated user
    updated = await get_user_by_token(session_token)
    return UserResponse(**updated)


@router.get("/validate")
async def validate_session(session_token: str):
    """Validate if session token is still valid."""
    user = await get_user_by_token(session_token)
    
    if user:
        return {"valid": True, "user_id": user['id']}
    
    return {"valid": False}
