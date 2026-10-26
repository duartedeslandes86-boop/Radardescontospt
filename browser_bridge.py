import asyncio
import logging
from typing import Awaitable, Callable, TypeVar

from playwright.async_api import (
    Browser,
    BrowserContext,
    Error as PlaywrightError,
    Playwright,
    async_playwright,
)

log = logging.getLogger(__name__)
T = TypeVar("T")

CONTEXT_OPTIONS = {
    "storage_state": "cookies_pt.json",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "viewport": {"width": 1920, "height": 1080},
}


class BrowserBridge:
    def __init__(self, max_concurrency: int = 2, total_timeout_s: float = 60.0):
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()
        self._sem = asyncio.Semaphore(max_concurrency)
        self.total_timeout_s = total_timeout_s

    async def _ensure_browser(self) -> Browser:
        async with self._lock:
            if self._browser and self._browser.is_connected():
                return self._browser
            await self._close_browser()
            if self._pw is None:
                self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(headless=True)
            log.info("Chromium iniciado")
            return self._browser

    async def _close_browser(self) -> None:
        if self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                log.warning("erro ao fechar browser", exc_info=True)
        self._browser = None

    async def _close_context(self, context: BrowserContext) -> None:
        try:
            await context.close()
        except Exception:
            log.warning("erro ao fechar context; a reiniciar browser", exc_info=True)
            await self._close_browser()

    async def run(self, job: Callable[[BrowserContext], Awaitable[T]]) -> T:
        async with self._sem:
            browser = await self._ensure_browser()
            context = await browser.new_context(**CONTEXT_OPTIONS)
            try:
                return await asyncio.wait_for(job(context), timeout=self.total_timeout_s)
            except asyncio.TimeoutError:
                log.warning("tarefa excedeu timeout; a fechar só este context")
                raise
            except PlaywrightError:
                log.exception("erro do Playwright; a fechar só este context")
                if not browser.is_connected():
                    await self._close_browser()
                raise
            finally:
                await self._close_context(context)

    async def close(self) -> None:
        await self._close_browser()
        if self._pw is not None:
            await self._pw.stop()
            self._pw = None
