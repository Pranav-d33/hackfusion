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


class LoginRequest(BaseModel):
    """User login request."""
    email: str
    password: str


class UpdateProfileRequest(BaseModel):
    """Update profile request."""
    name: Optional[str] = None
    phone: Optional[str] = None
    notification_enabled: Optional[bool] = None
    preferences: Optional[Dict[str, Any]] = None


class UserResponse(BaseModel):
    """User response model."""
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    notification_enabled: bool = True


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
        SELECT c.id, c.name, c.email, c.phone, c.notification_enabled
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
    user_id = await execute_write("""
        INSERT INTO customers (name, email, phone, password_hash, notification_enabled)
        VALUES (?, ?, ?, ?, 1)
    """, (request.name, request.email.lower(), request.phone, password_hash))
    
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
            notification_enabled=True,
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
        SELECT id, name, email, phone, notification_enabled
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
            notification_enabled=bool(user['notification_enabled']),
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
    
    if request.notification_enabled is not None:
        updates.append("notification_enabled = ?")
        params.append(1 if request.notification_enabled else 0)
    
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
