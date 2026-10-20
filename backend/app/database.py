import ssl
import os
import sys
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from typing import AsyncGenerator
from app.config import settings

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Patch SQLAlchemy's async MySQL adaptors for pool_pre_ping compatibility
try:
    from sqlalchemy.dialects.mysql.aiomysql import AsyncAdapt_aiomysql_connection
    AsyncAdapt_aiomysql_connection.ping = lambda self, reconnect=False: self.await_(self._connection.ping(reconnect))
except Exception:
    pass

try:
    from sqlalchemy.dialects.mysql.asyncmy import AsyncAdapt_asyncmy_connection
    AsyncAdapt_asyncmy_connection.ping = lambda self, reconnect=False: self.await_(self._do_ping())
except Exception:
    pass

try:
    from sqlalchemy.dialects.mysql.pymysql import MySQLDialect_pymysql
    def _safe_do_ping(self, dbapi_connection):
        try:
            return dbapi_connection.ping(False)
        except TypeError:
            return dbapi_connection.ping()
    MySQLDialect_pymysql.do_ping = _safe_do_ping
except Exception:
    pass

connect_args = {}
db_url = settings.database_url
if db_url.startswith("mysql+asyncmy://"):
    db_url = db_url.replace("mysql+asyncmy://", "mysql+aiomysql://")

if "aivencloud.com" in db_url or "ssl=true" in db_url.lower():
    ssl_context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ca_path = os.path.join(backend_dir, "ca.pem")
    if os.path.exists(ca_path):
        ssl_context.load_verify_locations(cafile=ca_path)
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_REQUIRED
    connect_args["ssl"] = ssl_context

engine = create_async_engine(
    db_url,
    echo=False,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_recycle=280,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
