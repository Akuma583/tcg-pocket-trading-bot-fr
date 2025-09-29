# fetch_pzone.py
import re
from seleniumwire import webdriver
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

def _normalize(data, player_id):
    cards = data.get("results") or data.get("cards")
    if not isinstance(cards, list):
        props = data.get("props", {}).get("pageProps", {})
        cards = props.get("cards") or props.get("playerCards") or []
        player_id = player_id or (props.get("player") or {}).get("id")
    def n(c):
        s = c.get("set")
        sc = s.get("code") if isinstance(s, dict) else s
        q = c.get("count") or c.get("quantity") or 1
        try: q = int(q)
        except: q = 1
        return {"card_id": c.get("id") or c.get("code"),
                "name": c.get("name"), "set": sc,
                "rarity": c.get("rarity"), "lang": c.get("language") or "FR",
                "qty": q}
    return {"player_id": str(player_id), "cards": [n(x) for x in cards]}

def fetch_collection(url: str) -> dict:
    """Ouvre la page P-Zone, intercepte /api/cards/search, renvoie un JSON normalisé."""
    opts = Options()
    # commente la ligne suivante si tu veux voir la fenêtre pour passer un captcha
    # opts.headless = True
    opts.add_argument("--no-sandbox"); opts.add_argument("--disable-gpu"); opts.add_argument("--window-size=1280,900")
    driver = webdriver.Chrome(ChromeDriverManager().install(), options=opts)
    driver.scopes = ['.*']
    try:
        driver.get(url)
        driver.implicitly_wait(10)
        payload = None
        for req in driver.requests:
            if req.response and "/api/cards/search" in req.url:
                try:
                    payload = req.response.json()
                    break
                except: pass
        if not payload:
            raise RuntimeError("JSON introuvable (captcha ou route différente).")
        m = re.search(r"/players/(\d+)/cards", url)
        player_id = m.group(1) if m else "unknown"
        return _normalize(payload, player_id)
    finally:
        driver.quit()
