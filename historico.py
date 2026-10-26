import asyncio
import logging
import os

import aiosqlite

log = logging.getLogger(__name__)

DB_PATH = os.environ.get("HISTORICO_DB", "historico.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS pesquisas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    termo TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_pesquisas_user ON pesquisas(user_id, id);
CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pesquisa_id INTEGER NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
    posicao INTEGER NOT NULL,
    asin TEXT,
    titulo TEXT NOT NULL,
    preco TEXT,
    url TEXT
);
CREATE INDEX IF NOT EXISTS idx_produtos_pesquisa ON produtos(pesquisa_id);
"""


class Historico:
    def __init__(self, path: str = DB_PATH):
        self._path = path
        self._db: aiosqlite.Connection | None = None
        self._lock = asyncio.Lock()

    async def abrir(self) -> None:
        self._db = await aiosqlite.connect(self._path)
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA foreign_keys=ON")
        await self._db.executescript(SCHEMA)
        await self._db.commit()
        log.info("histórico aberto em %s", self._path)

    async def fechar(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    async def guardar(self, user_id: int, termo: str, produtos: list[dict]) -> int:
        async with self._lock:
            try:
                cur = await self._db.execute(
                    "INSERT INTO pesquisas (user_id, termo) VALUES (?, ?)",
                    (user_id, termo),
                )
                pesquisa_id = cur.lastrowid
                await self._db.executemany(
                    "INSERT INTO produtos (pesquisa_id, posicao, asin, titulo, preco, url) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        (pesquisa_id, i, p.get("asin"), p["titulo"], p.get("preco"), p.get("url"))
                        for i, p in enumerate(produtos, start=1)
                    ],
                )
                await self._db.commit()
                return pesquisa_id
            except Exception:
                await self._db.rollback()
                raise

    async def historico(self, user_id: int, limite: int = 10) -> list[dict]:
        async with self._db.execute(
            """
            SELECT p.id, p.termo, p.criado_em, COUNT(pr.id)
            FROM pesquisas p
            LEFT JOIN produtos pr ON pr.pesquisa_id = p.id
            WHERE p.user_id = ?
            GROUP BY p.id
            ORDER BY p.id DESC
            LIMIT ?
            """,
            (user_id, limite),
        ) as cur:
            linhas = await cur.fetchall()
        return [
            {"id": r[0], "termo": r[1], "criado_em": r[2], "n_produtos": r[3]}
            for r in linhas
        ]
