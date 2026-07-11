const PROFANITY_LIST = [
  "fuck", "shit", "bitch", "asshole", "damn", "cunt", "dick", "cock", "pussy",
  "nigger", "nigga", "fag", "faggot", "retard", "whore", "slut", "cum", "twat",
  "bastard", "bollocks", "wanker", "dildo", "clit", "nazi", "hitler", "kike",
  "chink", "gook", "spic", "wetback", "tranny", "kunt", "dyke", "coon",
  "jigaboo", "porchmonkey", "raghead", "sandnigger", "towelhead", "beaner",
  "cholo", "honky", "cracker", "redskin", "squaw", "paki", "pikey", "gypsy",
  "penis", "vagina", "boobs", "tits", "nipple", "porn", "xxx", "sex", "anal",
  "rape", "molest", "pedo", "incest", "bestiality", "necrophilia", "zoophilia",
  "piss", "urine", "feces", "diarrhea", "vomit", "puke", "snot", "phlegm",
  "kill yourself", "kms", "kys", "suicide", "hang yourself", "die", "death threat",
  "terrorist", "bomb", "shooting", "massacre", "genocide", "holocaust", "lynch",
  "swastika", "heil", "white power", "white supremacy", "kkk", "klan",
  "blowjob", "handjob", "rimjob", "titjob", "creampie", "bukkake", "milf", "gilf",
  "lolita", "jailbait", "child porn", "cp", "csam", "snuff", "gore", "beheading",
  "fuckwad", "fucktard", "fuckface", "fuckboy", "fuckhead", "dickhead", "dickwad",
  "shithead", "shitface", "shitstain", "cumslut", "cocksucker", "motherfucker",
  "asswipe", "asshat", "assclown", "buttface", "butthole", "butt plug", "douche",
  "douchebag", "scumbag", "jackass", "dumbass", "smartass", "lazyass", "hardass",
  "piss off", "pissed", "wank", "wanking", "spank", "spanking", "orgasm", "masturbate",
  "masturbation", "jerk off", "jizz", "splooge", "sperm", "semen", "erection",
  "hardon", "boner", "stiffy", "wood", "chode", "taint", "gooch", "fart", "queef",
  "shart", "poop", "crap", "turd", "douche", "moron", "idiot", "stupid", "dumb",
  "retarded", "autistic", "schizo", "bipolar", "psycho", "maniac", "lunatic",
  "crazy", "insane", "mental", "cripple", "gimp", "spastic", "spaz", "deaf mute",
  "blind as a bat", "dumb as a rock", "special needs", "short bus", "window licker",
  "pillow biter", "carpet muncher", "rug muncher", "tuna taco", "beef curtains",
  "meat curtains", "roast beef", "axe wound", "bearded clam", "fish taco",
  "pink taco", "beaver", "bush", "muff", "cooter", "hooha", "vajayjay", "punani",
  "minge", "fanny", "knob", "prick", "tool", "wang", "dong", "schlong", "pecker",
  "weiner", "weenie", "willy", "johnson", "member", "manhood", "junk", "package",
  "balls", "nuts", "sack", "scrotum", "testicles", "nutsack", "taint", "perineum",
  "gooch", "grundle", "chode", "taint", "asscrack", "buttcrack", "camel toe",
  "moose knuckle", "muffin top", "fupa", "cankles", "man boobs", "moobs",
  "bitchtits", "backne", "bacne", "zit", "pimple", "pustule", "cyst", "boil",
  "abscess", "lesion", "wart", "herpes", "hpv", "hiv", "aids", "std", "sti",
  "gonorrhea", "chlamydia", "syphilis", "crabs", "lice", "scabies", "ringworm",
  "jock itch", "athletes foot", "yeast infection", "uti", "hemorrhoid", "hemroids",
  "tmi", "nsfw", "nsfl", "rule34", "rule 34", "e621", "gelbooru", "danbooru",
  "yande.re", "konachan", "sankaku", "pixiv", "deviantart", "furaffinity",
  "inkbunny", "sofurry", "weasyl", "e-hentai", "exhentai", "nhentai", "hanime",
  "xvideos", "pornhub", "xhamster", "redtube", "youporn", "tube8", "spankbang",
  "chaturbate", "onlyfans", "manyvids", "clips4sale", "fancentro", "justforfans",
  "fansly", "fanvue", "ifans", "swiipe", "admireme", " AVN", "myfreecams",
  "livejasmin", "streamate", "imlive", "camsoda", "bongacams", "stripchat",
  "flirt4free", "jerkmate", "camonster", "slutroulette", "chatrandom", "omegle",
  "chatroulette", "tinychat", "faceflow", "chatspin", "shagle", "chatki",
  "emeraldchat", "chatous", "holla", "azarlive", "livu", "tumile", "mico",
  "bigo", "tango", "liveme", "up", "17live", "streamkar", "nonolive", "live",
  "periscope", "meerkat", "younow", "live.ly", "livestream", "ustream",
  "twitch", "mixer", "dlive", "caffeine", "theta", "theta.tv", "theta tv",
];

const LEET_MAP: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "$": "s", "@": "a", "!": "i", "+": "t", "#": "h", "%": "x", "?": "q", "&": "and",
};

function normalize(text: string): string {
  let result = text.toLowerCase();
  // Replace leetspeak
  for (const [char, replacement] of Object.entries(LEET_MAP)) {
    result = result.replace(new RegExp(char, "g"), replacement);
  }
  // Remove common obfuscation characters
  result = result.replace(/[^a-z0-9\s]/g, "");
  return result;
}

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const normalized = normalize(text);
  const words = normalized.split(/\s+/);
  for (const bad of PROFANITY_LIST) {
    const badNorm = normalize(bad);
    // Check whole words
    if (words.includes(badNorm)) return true;
    // Check substrings (handles concatenated words like "motherfucker")
    if (normalized.includes(badNorm)) return true;
  }
  return false;
}

export function filterProfanity(text: string): string {
  if (!text) return text;
  let result = text;
  for (const bad of PROFANITY_LIST) {
    const regex = new RegExp(`\\b${bad}\\b`, "gi");
    result = result.replace(regex, "*".repeat(bad.length));
  }
  return result;
}
