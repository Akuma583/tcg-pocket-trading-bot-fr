# bot_pocket_upload.py  — Python 3.7, discord.py 1.7.x
import json
import aiosqlite
import discord
from discord.ext import commands
from datetime import datetime

TOKEN   = "TON_TOKEN_DISCORD"
DB_PATH = "tcg.db"
PREFIX  = "!"

intents = discord.Intents.default()
intents.guilds   = True
intents.messages = True  # pour lire le contenu & les pièces jointes
bot = commands.Bot(command_prefix=PREFIX, intents=intents, help_command=None)

# ---------- DB ----------
async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS collections(
              user_id TEXT PRIMARY KEY,
              player_id TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
        """)
        await db.commit()

# ---------- Normalisation ----------
def normalize_from_pzone(data: dict) -> dict:
    """
    Accepte:
      - JSON brut Next.js ({props:{pageProps:...}})
      - JSON API ({results:[...]}) ou ({cards:[...]})
      - déjà normalisé
    Retourne: {"player_id": "...", "cards":[{"card_id","name","set","rarity","lang","qty"}]}
    """
    props = data.get("props", {}).get("pageProps", {}) if "props" in data else data.get("pageProps", {})
    cards_src = None
    player_id = None

    if not props:
        cards_src = data.get("results") or data.get("cards")
    else:
        cards_src = props.get("cards") or props.get("playerCards") or props.get("data", {}).get("cards")
        player_id = (props.get("player") or {}).get("id") or props.get("playerId")

    if not cards_src and isinstance(data.get("cards"), list):
        cards_src = data["cards"]

    if not player_id:
        player_id = str(data.get("player_id") or data.get("playerId") or "unknown")

    if not isinstance(cards_src, list):
        raise ValueError("Impossible de trouver la liste des cartes dans le JSON fourni.")

    def norm(c):
        set_field = c.get("set")
        set_code = set_field.get("code") if isinstance(set_field, dict) else set_field
        qty = c.get("count") or c.get("quantity") or 1
        try:
            qty = int(qty)
        except Exception:
            qty = 1
        return {
            "card_id": c.get("id") or c.get("code"),
            "name":    c.get("name"),
            "set":     set_code,
            "rarity":  c.get("rarity"),
            "lang":    c.get("language") or "FR",
            "qty":     qty,
        }

    return {"player_id": str(player_id), "cards": [norm(x) for x in cards_src]}

# ---------- Events ----------
@bot.event
async def on_ready():
    await init_db()
    print(f"✅ Connecté en tant que {bot.user} — prêt. Préfixe: {PREFIX}")

# ---------- Commands ----------
@bot.command(name="sync_upload")
async def sync_upload(ctx: commands.Context):
    """
    Utilisation:
      envoie un message avec: !sync_upload
      + AJOUTE le fichier JSON en pièce jointe (collection_raw.json / collection.json)
    """
    if not ctx.message.attachments:
        return await ctx.reply("❌ Ajoute un **fichier .json** en pièce jointe à la commande `!sync_upload`.")

    att = ctx.message.attachments[0]
    if not att.filename.lower().endswith(".json"):
        return await ctx.reply("❌ Fichier non supporté. Envoie un **.json**.")

    try:
        raw_bytes = await att.read()
        data = json.loads(raw_bytes.decode("utf-8"))
        clean = normalize_from_pzone(data)
    except Exception as e:
        return await ctx.reply(f"❌ JSON invalide ou non reconnu : `{e}`")

    uid = str(ctx.author.id)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "REPLACE INTO collections(user_id, player_id, payload_json, updated_at) VALUES (?, ?, ?, ?)",
            (uid, clean["player_id"], json.dumps(clean, ensure_ascii=False),
             datetime.utcnow().isoformat(timespec="seconds"))
        )
        await db.commit()

    uniques = len(clean["cards"])
    total = sum(c["qty"] for c in clean["cards"])
    await ctx.reply(f"✅ Import OK pour **player {clean['player_id']}** — {uniques} uniques / {total} exemplaires.")

@bot.command(name="collection")
async def collection_cmd(ctx: commands.Context):
    """Affiche un résumé de la collection importée pour l'utilisateur courant."""
    uid = str(ctx.author.id)
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT player_id, payload_json, updated_at FROM collections WHERE user_id=?", (uid,))
        row = await cur.fetchone()

    if not row:
        return await ctx.reply("Aucune collection enregistrée. Envoie d’abord ton export JSON avec `!sync_upload` (en PJ).")

    player_id, payload_json, updated_at = row
    payload = json.loads(payload_json)
    uniques = len(payload["cards"])
    total = sum(c["qty"] for c in payload["cards"])
    await ctx.reply(f"**Player {player_id}** — {uniques} cartes uniques / {total} exemplaires (maj: {updated_at} UTC)")

@bot.command(name="help")
async def help_cmd(ctx):
    await ctx.reply(
        "**Commandes :**\n"
        f"- `{PREFIX}sync_upload` + **fichier .json** en pièce jointe → import/maj de ta collection\n"
        f"- `{PREFIX}collection` → résumé rapide\n"
    )

bot.run(TOKEN)
