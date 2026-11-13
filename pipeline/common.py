"""Shared normalization, deck taxonomy and text utilities for the trivia pipeline."""
import html
import re
import hashlib

# ---------------------------------------------------------------- text cleanup

_ESCAPES = [('\\"', '"'), ("\\'", "'"), ("\\\\", "\\")]
_QUOTES = {
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
    "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
    "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u00a0": " ",
}


def clean(text: str) -> str:
    if not text:
        return ""
    s = text
    for a, b in _ESCAPES:
        s = s.replace(a, b)
    s = html.unescape(s)
    for a, b in _QUOTES.items():
        s = s.replace(a, b)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def key(text: str) -> str:
    """Canonical lookup key for an answer."""
    s = clean(text).lower()
    s = re.sub(r"^[\"'(\[]+", "", s)
    s = re.sub(r"[\"')\],.!?:;]+$", "", s)
    s = re.sub(r"^(the|a|an) ", "", s)
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clue_id(date: str, rnd: str, category: str, clue: str) -> str:
    h = hashlib.sha1(f"{date}|{rnd}|{category}|{clue[:120]}".encode()).hexdigest()
    return h[:10]


# ---------------------------------------------------------------- deck taxonomy
# Ordered: first matching rule wins. Categories are wildly specific on Jeopardy,
# so these are deliberately broad buckets used for browsing, not for scoring.

DECKS = [
    ("literature", "Literature", "BOOKS & AUTHORS", "Novels, poets, characters and the written word",
     r"\b(LITERATURE|LITERARY|BOOK|BOOKS|AUTHOR|AUTHORS|NOVEL|NOVELS|POET|POETS|POETRY|POEM|POEMS|"
     r"FICTION|WRITER|WRITERS|SHAKESPEARE|DICKENS|HEMINGWAY|TWAIN|AUSTEN|FAULKNER|BIBLE AS LIT|"
     r"CHILDREN'S LIT|FAIRY TALE|FABLES?|PLAYWRIGHT|PLAYS|SHORT STOR|ESSAY|MEMOIR|BIOGRAPH|"
     r"BESTSELLER|TRILOG|PULITZER|NOBEL|CHARACTER|PROTAGONIST)\b"),
    ("history", "History", "HISTORY", "Empires, wars, revolutions and the people who ran them",
     r"\b(HISTORY|HISTORIC|HISTORICAL|WAR|WARS|BATTLE|CIVIL WAR|REVOLUTION|PRESIDENT|PRESIDENTS|"
     r"DYNAST|EMPIRE|EMPEROR|KING|QUEENS?|ROYAL|MONARCH|ANCIENT|MEDIEVAL|RENAISSANCE|COLONIAL|"
     r"CENTURY|TREATY|CONSTITUTION|CONGRESS|SENATE|ELECTION|ASSASSINAT|COLD WAR|WORLD WAR|"
     r"VIETNAM|KOREA|NAPOLEON|ROMAN|GREEK|EGYPT|MESOPOTAMIA|AZTEC|MAYA|INCA|VIKING|CRUSADE|"
     r"INDEPENDENCE|SLAVERY|ABOLITION|SUFFRAGE|IMMIGRATION|FOUNDING|PRESIDENTIAL|FIRST LADY)\b"),
    ("geography", "Geography", "WORLD GEOGRAPHY", "Countries, capitals, rivers, borders and the map",
     r"\b(GEOGRAPH|CAPITAL|CAPITALS|COUNTR|STATE|STATES|CITY|CITIES|RIVER|RIVERS|LAKE|LAKES|"
     r"MOUNTAIN|MOUNTAINS|ISLAND|ISLANDS|OCEAN|SEA|SEAS|DESERT|CONTINENT|BORDER|BORDERS|"
     r"MAP|MAPS|ATLAS|REGION|PROVINCE|TERRITOR|PENINSULA|VOLCANO|VALLEY|COAST|PORT|"
     r"LAKES & RIVERS|BODIES OF WATER|WORLD|AFRICA|ASIA|EUROPE|U\.S\.|UNITED STATES|"
     r"LANDMARK|MONUMENT|NATIONAL PARK|WORLD HERITAGE|CURRENC|FLAG|FLAGS)\b"),
    ("science", "Science & Nature", "SCIENCE", "Physics, chemistry, biology, space and the body",
     r"\b(SCIENCE|SCIENTIFIC|PHYSICS|CHEMISTRY|CHEMICAL|BIOLOGY|BIOLOGICAL|ASTRONOMY|ASTRONOM|"
     r"MEDICINE|MEDICAL|ANATOMY|BODY|BONES?|BLOOD|BRAIN|DNA|GENETIC|EVOLUTION|ELEMENT|ELEMENTS|"
     r"PERIODIC|PLANET|PLANETS|SPACE|NASA|TELESCOPE|GRAVITY|ATOM|MOLECULE|MATH|MATHEMATIC|"
     r"GEOLOGY|WEATHER|CLIMATE|ENERGY|ELECTRIC|COMPUTER|TECHNOLOGY|INVENTION|ENGINEER|"
     r"ANIMAL|ANIMALS|BIRD|BIRDS|INSECT|INSECTS|FISH|REPTILE|MAMMAL|DINOSAUR|PLANT|PLANTS|"
     r"TREE|TREES|FLOWER|FLOWERS|BOTANY|ZOOLOGY|EARTH|MOON|SUN|STARS?|SPACE|OCEAN LIFE)\b"),
    ("arts", "Art & Architecture", "ART", "Painters, masterpieces, buildings and design",
     r"\b(ART|ARTIST|ARTISTS|PAINTING|PAINTINGS|PAINTER|SCULPTURE|SCULPTOR|MUSEUM|MUSEUMS|"
     r"ARCHITECT|ARCHITECTURE|BUILDING|BUILDINGS|PHOTOGRAPH|DESIGN|DRAWING|PORTRAIT|"
     r"IMPRESSIONIST|RENAISSANCE ART|CEZANNE|PICASSO|VAN GOGH|MONET|MICHELANGELO|DA VINCI|"
     r"ROCKWELL|WARHOL|O'KEEFFE|HOPPER|GOYA|EL GRECO|REMBRANDT|VERMEER|MAGRITTE|MUNCH|"
     r"GAUGUIN|ROUSSEAU|RODIN|DUCHAMP|KANDINSKY|WHISTLER|CASSATT|HOCKNEY|LICHTENSTEIN)\b"),
    ("film-tv", "Film & TV", "MOVIES", "Directors, stars, Oscars, sitcoms and the small screen",
     r"\b(MOVIE|MOVIES|FILM|FILMS|CINEMA|ACTOR|ACTORS|ACTRESS|DIRECTOR|DIRECTORS|OSCAR|OSCARS|"
     r"ACADEMY AWARD|TV|TELEVISION|SITCOM|SERIES|EPISODE|SCREEN|HOLLYWOOD|COMEDY|"
     r"CARTOON|ANIMAT|DOCUMENTAR|BROADWAY|MUSICAL|STAGE|THEATER|THEATRE|PLAYBILL|EMMY|"
     r"GOLDEN GLOBE|BOX OFFICE|SEQUEL|COEN|HITCHCOCK|SPIELBERG|KUBRICK|SCORSESE)\b"),
    ("music", "Music", "MUSIC", "Composers, bands, songs, opera and the charts",
     r"\b(MUSIC|MUSICAL|SONG|SONGS|SINGER|BAND|BANDS|ALBUM|ALBUMS|COMPOSER|COMPOSERS|OPERA|"
     r"SYMPHONY|CONCERTO|ORCHESTRA|PIANO|GUITAR|VIOLIN|DRUM|JAZZ|ROCK|POP|HIP HOP|RAP|"
     r"BILLBOARD|GRAMMY|MOTOWN|BEATLES|ELVIS|MOZART|BEETHOVEN|BACH|WAGNER|VERDI|PUCCINI|"
     r"BROADWAY MUSICAL|LYRICS|TUNE|BALLAD|FOLK|COUNTRY MUSIC|CLASSICAL)\b"),
    ("sports", "Sports", "SPORTS", "Olympics, leagues, legends and the rules of the game",
     r"\b(SPORT|SPORTS|OLYMPIC|OLYMPICS|BASEBALL|FOOTBALL|BASKETBALL|HOCKEY|TENNIS|GOLF|"
     r"SOCCER|BOXING|TRACK|FIELD|SWIMMING|SKIING|BOWLING|MARATHON|WORLD SERIES|SUPER BOWL|"
     r"STANLEY CUP|NBA|NFL|MLB|NHL|FIFA|WORLD CUP|ATHLETE|ATHLETES|COACH|STADIUM|"
     r"TEAM|TEAMS|LEAGUE|CHAMPION|CHAMPIONSHIP|TOURNAMENT|MEDAL|MEDALS)\b"),
    ("myth-religion", "Myth & Religion", "MYTHOLOGY", "Gods, heroes, scripture and belief",
     r"\b(MYTH|MYTHS|MYTHOLOGY|MYTHOLOGICAL|GOD|GODS|GODDESS|GODDESSES|RELIGION|RELIGIOUS|"
     r"BIBLE|BIBLICAL|SCRIPTURE|SAINT|SAINTS|POPE|CHURCH|CATHOLIC|JEWISH|JUDAISM|ISLAM|"
     r"MUSLIM|HINDU|BUDDH|GREEK MYTH|ROMAN MYTH|NORS|EGYPTIAN GOD|OLYMPUS|TITAN|"
     r"DEMIGOD|LEGEND|LEGENDS|FOLKLORE|HOLY|PSALM|GOSPEL|QURAN|TORAH|TALMUD)\b"),
    ("food-drink", "Food & Drink", "FOOD & DRINK", "Dishes, ingredients, cocktails and cuisine",
     r"\b(FOOD|FOODS|DRINK|DRINKS|CUISINE|COOK|COOKING|CHEF|RECIPE|INGREDIENT|INGREDIENTS|"
     r"WINE|BEER|COCKTAIL|WHISKEY|VODKA|RESTAURANT|DESSERT|CHEESE|BREAD|FRUIT|FRUITS|"
     r"VEGETABLE|VEGETABLES|MEAT|SPICE|SPICES|COFFEE|TEA|CHOCOLATE|CANDY|PIZZA|PASTA|"
     r"SOUP|SALAD|BREAKFAST|DINNER|MENU|GOURMET|BEVERAGE|BEVERAGES)\b"),
    ("words-language", "Words & Language", "WORD ORIGINS", "Etymology, wordplay, grammar and phrases",
     r"\b(WORD|WORDS|WORD ORIGIN|ORIGIN|ORIGINS|ETYMOLOG|PHRASE|PHRASES|IDIOM|LANGUAGE|"
     r"LANGUAGES|VOCABULARY|GRAMMAR|SPELLING|RHYME|SYNONYM|ANTONYM|PREFIX|SUFFIX|"
     r"LETTER|LETTERS|ALPHABET|TRANSLAT|SILENT|ANAGRAM|PALINDROME|CROSSWORD|"
     r"BLANK|FILL IN|WHAT'S THE WORD|NAME THAT|TERM|TERMS|SLANG|JARGON)\b"),
    ("business", "Business & Tech", "BUSINESS & INDUSTRY", "Companies, money, machines and the internet",
     r"\b(BUSINESS|BUSINESSES|ECONOM|FINANC|MONEY|BANK|STOCK|MARKET|COMPAN|CORPORATION|"
     r"INDUSTRY|INDUSTRIAL|ENTREPRENEUR|BILLIONAIRE|ADVERTIS|BRAND|BRANDS|PRODUCT|"
     r"COMPUTER|COMPUTERS|INTERNET|SOFTWARE|APP|APPS|TECHNOLOGY|TECH|INVENTION|INVENTOR|"
     r"PATENT|ROBOT|ARTIFICIAL INTELLIGENCE|SOCIAL MEDIA|STARTUP|CEO)\b"),
    ("pop-culture", "Pop Culture", "POP CULTURE", "Celebrities, comics, games, fashion and fads",
     r"\b(POP CULTURE|CELEBRIT|FAMOUS|FASHION|VIDEO GAME|VIDEO GAMES|COMIC|COMICS|SUPERHERO|"
     r"CARTOON|TOY|TOYS|DOLL|GAME|GAMES|PUZZLE|TRIVIA|FAD|CRAZE|INTERNET MEME|MEME|"
     r"MAGAZINE|MAGAZINES|NEWSPAPER|TELEVISION|RADIO|ADVERTISING|PHOTOGRAPH|"
     r"PEOPLE|PERSONALITIES|STARS|ICON)\b"),
    ("world-culture", "World & Culture", "WORLD CULTURE", "Holidays, customs, royalty and daily life",
     r"\b(HOLIDAY|HOLIDAYS|CHRISTMAS|HALLOWEEN|THANKSGIVING|EASTER|CUSTOM|CUSTOMS|TRADITION|"
     r"FESTIVAL|CARNIVAL|ROYAL|QUEEN|KING|PRINCE|PRINCESS|PALACE|CURRENC|POSTAL|STAMP|"
     r"TRANSPORTATION|TRAIN|TRAINS|AUTO|CARS|SHIP|SHIPS|AVIATION|FLIGHT|HOTEL|TOURISM|"
     r"UNIVERSITY|COLLEGE|SCHOOL|EDUCATION|ARCHAEOLOG|ANTHROPOLOG|SOCIETY|POPULATION)\b"),
]

DECK_BY_ID = {d[0]: {"id": d[0], "title": d[1], "sample": d[2], "blurb": d[3]} for d in DECKS}
DECK_RULES = [(d[0], re.compile(d[4])) for d in DECKS]

FALLBACK_DECK = "potpourri"
DECK_BY_ID[FALLBACK_DECK] = {
    "id": FALLBACK_DECK, "title": "Potpourri", "sample": "POTPOURRI",
    "blurb": "The glorious grab bag: everything else Jeopardy loves to ask",
}


def deck_for(category: str) -> str:
    cat = clean(category).upper()
    for deck_id, rx in DECK_RULES:
        if rx.search(cat):
            return deck_id
    return FALLBACK_DECK


# ---------------------------------------------------------------- clue quality

MEDIA_RX = re.compile(
    r"\b(seen here|shown here|pictured|this (image|photo|picture|video|audio|map|chart|graph)|"
    r"in this (image|photo|picture|video)|listen|listening|audio clue|video clue|"
    r"on screen|the screen|visual clue|sound clip|song clip|this clip|this recording)\b",
    re.I,
)
DEICTIC_RX = re.compile(r"\b(this|these|here)\b", re.I)


def is_usable(clue: str, response: str, category: str) -> bool:
    """Text-only, self-contained-ish clues for a typing/tapping quiz."""
    if not clue or not response:
        return False
    if MEDIA_RX.search(clue) or MEDIA_RX.search(category):
        return False
    r = clean(response)
    if len(r) > 90 or len(r) < 1:
        return False
    if re.search(r"(__|___|\[|\]|<|>)", r):
        return False
    if re.fullmatch(r"[\d\s.,%-]+", r):
        return False
    if re.search(r"^(name (any|one|two|three)|any (one|two|three)|all of these|none)\b", r, re.I):
        return False
    return True
