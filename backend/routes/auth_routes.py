"""
Authentication Routes
User registration, login, and profile management.
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
import hashlib
import os
import jwt
from datetime import datetime, timedelta
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
    password: Optional[str] = None
    # Social provider fields (Google)
    provider: Optional[str] = None  # 'google'
    uid: Optional[str] = None       # Firebase UID
    name: Optional[str] = None


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


# ============ JWT Helper Functions ============

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "mediloon_super_secret_jwt_key_2026")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_DAYS = 30

def create_access_token(data: dict) -> str:
    """Create a new JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT access token."""
    try:
        decoded_data = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return decoded_data
    except jwt.PyJWTError:
        return None

# ============ Helper Functions ============

def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt."""
    # Use a simple hash for demo (in production, use bcrypt)
    salt = "mediloon_salt_2026"
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def get_token_from_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract token from Authorization header (Bearer token) or return None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.split(" ")[1]

async def get_user_by_token(session_token: str = None, authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """Get user from JWT token."""
    
    # Check header first, then fallback to query param (for backwards compatibility during transition)
    token = get_token_from_header(authorization)
    if not token:
        token = session_token
        
    if not token:
        return None
        
    # Decode JWT
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except jwt.PyJWTError:
        return None

    # Fetch user from DB
    result = await execute_query("""
        SELECT id, name, email, phone, age, gender, address, city, state, postal_code, country, notification_enabled, profile_completed
        FROM customers
        WHERE id = ?
    """, (user_id,))
    
    if result:
        return dict(result[0])
    return None


# ============ Routes ============

@router.post("/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    """Register a new user."""
    # Check if email already exists
    existing = await execute_query(
        "SELECT id, name, email, phone, age, gender, address, city, state, postal_code, country, notification_enabled, profile_completed, password_hash FROM customers WHERE email = ?",
        (request.email.lower(),)
    )
    
    if existing:
        user = existing[0]
        # If user was created via Google (no password), upgrade to email/password account
        if not user.get('password_hash'):
            password_hash = hash_password(request.password)
            updates = ["password_hash = ?"]
            params = [password_hash]
            if request.name and not user.get('name'):
                updates.append("name = ?")
                params.append(request.name)
            if request.phone and not user.get('phone'):
                updates.append("phone = ?")
                params.append(request.phone)
            params.append(user['id'])
            await execute_write(
                f"UPDATE customers SET {', '.join(updates)} WHERE id = ?",
                tuple(params)
            )
            # Re-fetch updated user
            result = await execute_query(
                "SELECT id, name, email, phone, age, gender, address, city, state, postal_code, country, notification_enabled, profile_completed FROM customers WHERE id = ?",
                (user['id'],)
            )
            user = result[0] if result else user
            session_token = create_access_token(data={"sub": str(user['id'])})
            return AuthResponse(
                user=UserResponse(
                    id=user['id'], name=user['name'] or request.name, email=user['email'],
                    phone=user.get('phone') or request.phone, age=user.get('age'), gender=user.get('gender'),
                    address=user.get('address'), city=user.get('city'), state=user.get('state'),
                    postal_code=user.get('postal_code'), country=user.get('country'),
                    notification_enabled=bool(user.get('notification_enabled', True)),
                    profile_completed=bool(user.get('profile_completed', False)),
                ),
                session_token=session_token,
                message="Account upgraded with password",
            )
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    password_hash = hash_password(request.password)
    
    # Create user
    profile_completed = all([request.age, request.gender, request.address])
    user_id = await execute_write("""
        INSERT INTO customers (name, email, phone, age, gender, address, city, state, postal_code, country, password_hash, notification_enabled, profile_completed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    """, (request.name, request.email.lower(), request.phone, request.age, request.gender, request.address, request.city, request.state, request.postal_code, request.country or 'Germany', password_hash, 1 if profile_completed else 0))
    
    # Create session (JWT)
    session_token = create_access_token(data={"sub": str(user_id)})
    
    # Note: We no longer insert into user_sessions as JWT is stateless
    # await execute_write("""
    #     INSERT INTO user_sessions (user_id, session_token, expires_at)
    #     VALUES (?, ?, datetime('now', '+30 days'))
    # """, (user_id, session_token))
    
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
    """Login user. Supports email/password and Google social auth."""
    # ── Google social provider ───────────────────────────────────────────────
    if request.provider == 'google':
        if not request.email:
            raise HTTPException(status_code=400, detail="Email required for Google login")
        result = await execute_query(
            "SELECT id, name, email, phone, age, gender, address, city, state, postal_code, country, notification_enabled, profile_completed FROM customers WHERE email = ?",
            (request.email.lower(),)
        )
        if result:
            user = result[0]
        else:
            display_name = request.name or request.email.split('@')[0]
            user_id = await execute_write("""
                INSERT INTO customers (name, email, notification_enabled, profile_completed)
                VALUES (?, ?, 1, 0)
            """, (display_name, request.email.lower()))
            result = await execute_query(
                "SELECT id, name, email, phone, age, gender, address, city, state, postal_code, country, notification_enabled, profile_completed FROM customers WHERE id = ?",
                (user_id,)
            )
            if not result:
                raise HTTPException(status_code=500, detail="Failed to create user")
            user = result[0]
        session_token = create_access_token(data={"sub": str(user['id'])})
        return AuthResponse(
            user=UserResponse(
                id=user['id'], name=user['name'], email=user['email'],
                phone=user.get('phone'), age=user.get('age'), gender=user.get('gender'),
                address=user.get('address'), city=user.get('city'), state=user.get('state'),
                postal_code=user.get('postal_code'), country=user.get('country'),
                notification_enabled=bool(user.get('notification_enabled', True)),
                profile_completed=bool(user.get('profile_completed', False)),
            ),
            session_token=session_token,
            message="Social login successful",
        )

    # ── Email / password ────────────────────────────────────────────────────
    if not request.password:
        raise HTTPException(status_code=400, detail="Password is required for email login")

    password_hash = hash_password(request.password)
    
    # Check if user exists in local DB
    result = await execute_query("""
        SELECT * FROM customers WHERE email = ?
    """, (request.email.lower(),))
    
    if not result:
        # User exist in Firebase (ensured by frontend) but not in local DB. Sync them.
        display_name = request.name or request.email.split('@')[0]
        user_id = await execute_write("""
            INSERT INTO customers (name, email, password_hash, notification_enabled, profile_completed)
            VALUES (?, ?, ?, 1, 0)
        """, (display_name, request.email.lower(), password_hash))
        
        result = await execute_query("SELECT * FROM customers WHERE id = ?", (user_id,))
        if not result:
            raise HTTPException(status_code=500, detail="Failed to sync user to database")
        user = result[0]
    else:
        user = result[0]
        # If password hash doesn't match, they might have reset it in Firebase or we are syncing them.
        # Since frontend validated via Firebase, we should update local DB to match.
        if user['password_hash'] != password_hash:
            await execute_write("UPDATE customers SET password_hash = ? WHERE id = ?", (password_hash, user['id']))
            user = dict(user)
            user['password_hash'] = password_hash

    session_token = create_access_token(data={"sub": str(user['id'])})
    return AuthResponse(
        user=UserResponse(
            id=user['id'], name=user['name'], email=user['email'],
            phone=user.get('phone'), age=user.get('age'), gender=user.get('gender'),
            address=user.get('address'), city=user.get('city'), state=user.get('state'),
            postal_code=user.get('postal_code'), country=user.get('country'),
            notification_enabled=bool(user.get('notification_enabled', True)),
            profile_completed=bool(user.get('profile_completed', False)),
        ),
        session_token=session_token,
        message="Login successful",
    )


@router.post("/logout")
async def logout(session_token: Optional[str] = None, authorization: Optional[str] = Header(None)):
    """Logout user (Client side should discard JWT)."""
    # In a stateless JWT system, logout is handled client-side by discarding the token.
    # Optionally, we could implement a token blacklist here if needed.
    
    # For backwards compatibility with old sessions, we still delete from DB if it exists
    token = get_token_from_header(authorization) or session_token
    if token:
        await execute_write(
            "DELETE FROM user_sessions WHERE session_token = ?",
            (token,)
        )
    return {"status": "logged_out", "message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_profile(user: dict = Depends(get_user_by_token)):
    """Get current user profile."""
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    return UserResponse(**user)


@router.put("/me", response_model=UserResponse)
async def update_profile(request: UpdateProfileRequest, user: dict = Depends(get_user_by_token)):
    """Update user profile."""
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
    updated = await execute_query("SELECT * FROM customers WHERE id = ?", (user['id'],))
    updated_user = dict(updated[0]) if updated else user
    
    # We need to map `password_hash` out of the dict, but we already have a UserResponse model
    # Let's clean the dict to match the model
    return UserResponse(
        id=updated_user['id'],
        name=updated_user['name'],
        email=updated_user['email'],
        phone=updated_user['phone'],
        age=updated_user.get('age'),
        gender=updated_user.get('gender'),
        address=updated_user.get('address'),
        city=updated_user.get('city'),
        state=updated_user.get('state'),
        postal_code=updated_user.get('postal_code'),
        country=updated_user.get('country'),
        notification_enabled=bool(updated_user.get('notification_enabled', True)),
        profile_completed=bool(updated_user.get('profile_completed', False)),
    )


@router.get("/validate")
async def validate_session(user: dict = Depends(get_user_by_token)):
    """Validate if session token is still valid."""
    if user:
        return {"valid": True, "user_id": user['id']}
    
    return {"valid": False}
