# app/auth.py
from __future__ import annotations
import hashlib
from typing import Optional
from sqlalchemy.orm import Session
from .models import User

def hash_password(password: str) -> str:
    """Simple password hashing using SHA-256 (no salt; dev only)."""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return hash_password(plain_password) == hashed_password

def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()

def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    user = get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.password_hash or ""):
        return None
    return user

def create_user(
    db: Session,
    username: str,
    email: str,
    password: str,
    name: str | None = None,
    role: str = "viewer",
) -> User:
    hashed_password = hash_password(password)
    user = User(
        username=username,
        email=email,
        password_hash=hashed_password,
        name=name,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
