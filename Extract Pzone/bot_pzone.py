# bot_pzone.py
import json, asyncio
import discord
from discord.ext import commands
from fetch_pzone import fetch_collection, init_db, save_collection

TOKEN = "TON_TOKEN_DISCORD"
PREFIX = "!"
DB_PATH = "tcg.db"

intents = discord.Intents.default()
bot = commands.Bot(command_prefix=PREFIX, intents=intents)

@bot.event
async def on_ready():
    await init_db()
    print(f"✅ Connecté en tant que {bot.user}")

@bot.command(name="sync")
async def sync_cmd(ctx, url: str):
    """Importer ta collection via ton URL Pokémon Zone"""
    await ctx.send("⏳ Récupération en cours...")
    try:
        clean = fetch_collection(url)
        await save_collection(str(ctx.author.id), clean)
        uniques = len(clean["cards"])
        total = sum(c["qty"] for c in clean["cards"])
        await ctx.send(f"✅ Import OK : {uniques} cartes uniques / {total} exemplaires.")
    except Exception as e:
        await ctx.send(f"❌ Erreur: {e}")

@bot.command(name="collection")
async def collection_cmd(ctx):
    """Voir un résumé de ta collection"""
    import aiosqlite
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT payload_json FROM collections WHERE user_id=?", (str(ctx.author.id),))
        row = await cur.fetchone()
    if not row:
        return await ctx.send("❌ Pas de collection enregistrée. Utilise `!sync <url>` d’abord.")
    payload = json.loads(row[0])
    uniques = len(payload["cards"])
    total = sum(c["qty"] for c in payload["cards"])
    await ctx.send(f"**{payload['player_id']}** — {uniques} cartes uniques / {total} exemplaires.")

bot.run(TOKEN)
