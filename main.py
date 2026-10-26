import asyncio
import logging
import os

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

from browser_bridge import BrowserBridge
from amazon_scraper import procurar_amazon
from historico import Historico

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bot")

bridge = BrowserBridge(max_concurrency=2, total_timeout_s=60)
historico = Historico()


def formatar_resultados(produtos: list[dict]) -> str:
    if not produtos:
        return "Sem resultados."
    return "\n\n".join(
        f"**{p['titulo'][:60]}...**\n💰 {p['preco']}\n🔗 <{p['url']}>"
        for p in produtos
    )


async def cmd_fetch(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = " ".join(context.args).strip()
    if not query:
        await update.message.reply_text("Uso: /fetch <termo>")
        return

    msg = await update.message.reply_text("A pesquisar…")
    try:
        produtos = await bridge.run(lambda ctx: procurar_amazon(ctx, query))
    except asyncio.TimeoutError:
        await msg.edit_text("Demorou demasiado. Tenta outra vez.")
        return
    except Exception:
        log.exception("falha em /fetch")
        await msg.edit_text("Erro ao pesquisar. Registado nos logs.")
        return

    texto = formatar_resultados(produtos)
    try:
        await historico.guardar(update.effective_user.id, query, produtos)
    except Exception:
        log.exception("falha ao guardar pesquisa no histórico")
        texto += "\n\n⚠️ Não foi possível guardar esta pesquisa no histórico."

    await msg.edit_text(texto)


async def cmd_historico(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    linhas = await historico.historico(update.effective_user.id)
    if not linhas:
        await update.message.reply_text("Ainda não fizeste pesquisas.")
        return
    texto = "\n".join(
        f"{l['criado_em']} — {l['termo']} ({l['n_produtos']} produtos)" for l in linhas
    )
    await update.message.reply_text(texto)


async def on_startup(app: Application) -> None:
    await historico.abrir()


async def on_shutdown(app: Application) -> None:
    await bridge.close()
    await historico.fechar()


def main() -> None:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    app = (
        Application.builder()
        .token(token)
        .post_init(on_startup)
        .post_shutdown(on_shutdown)
        .build()
    )
    app.add_handler(CommandHandler("fetch", cmd_fetch))
    app.add_handler(CommandHandler("historico", cmd_historico))
    app.run_polling()


if __name__ == "__main__":
    main()
