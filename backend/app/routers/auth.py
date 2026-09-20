from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import AuthContext, csrf_protected, current_auth
from ..models import Session, User
from ..schemas import AuthResponse, Message, UserLogin, UserRead, UserRegister
from ..security import (
    clear_auth_cookies,
    expires_at,
    hash_password,
    random_token,
    set_auth_cookies,
    sign_session_token,
    token_hash,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


async def issue_session(user: User, request: Request, response: Response, db: AsyncSession, settings: Settings) -> AuthResponse:
    raw_token = random_token()
    csrf_token = random_token(24)
    session = Session(
        user_id=user.id,
        token_hash=token_hash(raw_token),
        csrf_token=csrf_token,
        expires_at=expires_at(settings.session_ttl_days),
        user_agent=request.headers.get("user-agent", "")[:500] or None,
        ip_address=request.client.host if request.client else None,
    )
    db.add(session)
    await db.commit()
    set_auth_cookies(response, settings, sign_session_token(raw_token, settings.secret_key), csrf_token)
    return AuthResponse(user=UserRead.model_validate(user), csrf_token=csrf_token)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    email = payload.email.lower().strip()
    if (await db.execute(select(User.id).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=email, password_hash=hash_password(payload.password), full_name=payload.full_name.strip(), phone=payload.phone)
    db.add(user)
    await db.flush()
    return await issue_session(user, request, response, db, settings)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    user = (await db.execute(select(User).where(User.email == payload.email.lower().strip()))).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return await issue_session(user, request, response, db, settings)


@router.get("/me", response_model=UserRead)
async def me(auth: AuthContext = Depends(current_auth)):
    return auth.user


@router.post("/logout", response_model=Message)
async def logout(
    response: Response,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    await db.execute(delete(Session).where(Session.id == auth.session.id))
    await db.commit()
    clear_auth_cookies(response, settings)
    return Message(message="Signed out")
