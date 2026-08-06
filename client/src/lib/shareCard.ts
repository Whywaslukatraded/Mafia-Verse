// Client-side, dependency-free share card generator for the Game Over screen.
//
// There is no existing canvas / html-to-image / html2canvas utility anywhere
// in the codebase (searched for canvas, toDataURL, toBlob, html-to-image,
// dom-to-image, html2canvas — no hits), so this builds the image with the
// native Canvas API directly. It intentionally avoids adding a new
// dependency for something this small.
//
// Colors are pulled from the live theme at generation time (by rendering a
// hidden element with the app's real Tailwind classes and reading its
// computed style) rather than hardcoded, so the card always matches
// whatever the current dark/light theme actually is instead of a guess.

export type ShareCardRole =
  | "mafia" | "detective" | "doctor" | "civilian"
  | "bodyguard" | "vigilante" | "mayor" | "jester";

export interface ShareCardHighlight {
  text: string;
}

export interface ShareCardOptions {
  playerName: string;
  avatarEmoji: string;
  // Equipped cosmetics — same shape PlayerCard.tsx reads from player.avatarConfig.
  // bg is a Tailwind background class (e.g. "bg-blue-500"); accessory/clothing
  // are emoji, matching how PlayerCard layers them over the avatar circle.
  avatarConfig?: { bg?: string; accessory?: string; clothing?: string } | null;
  role: ShareCardRole;
  won: boolean;
  winnerLabel: string; // e.g. "MAFIA WINS" / "TOWN WINS" / "JESTER WINS" — already translated
  roleLabel: string; // already translated role name
  resultLabel: string; // already translated "YOU WON" / "YOU LOST"
  highlights: ShareCardHighlight[];
  roomLabel?: string; // e.g. room name/code, optional
}

const WIDTH = 800;
const HEIGHT = 1000;

function readComputedColor(tailwindClasses: string, property: "color" | "backgroundColor"): string {
  const el = document.createElement("div");
  el.className = tailwindClasses;
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  const value = getComputedStyle(el)[property];
  document.body.removeChild(el);
  return value || "#000000";
}

function roleAccent(role: ShareCardRole): string {
  // Matches the color mapping already used for role text elsewhere in Room.tsx
  switch (role) {
    case "mafia": return readComputedColor("text-red-400", "color");
    case "detective": return readComputedColor("text-blue-400", "color");
    case "doctor": return readComputedColor("text-yellow-400", "color");
    case "jester": return readComputedColor("text-pink-400", "color");
    default: return readComputedColor("text-green-400", "color");
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateShareCard(options: ShareCardOptions): Promise<{ canvas: HTMLCanvasElement; toBlob: () => Promise<Blob | null>; dataUrl: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const bg = readComputedColor("bg-background", "backgroundColor");
  const cardBg = readComputedColor("bg-card", "backgroundColor");
  const border = readComputedColor("border-border", "color");
  const foreground = readComputedColor("text-foreground", "color");
  const muted = readComputedColor("text-muted-foreground", "color");
  const primary = readComputedColor("text-primary", "color");
  const accent = roleAccent(options.role);
  const winColor = options.won ? readComputedColor("text-green-400", "color") : readComputedColor("text-red-400", "color");

  // Background + vignette
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 100, WIDTH / 2, HEIGHT / 2, WIDTH * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Wordmark
  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = "bold 20px monospace";
  ctx.fillText("MAFIA VERSE", WIDTH / 2, 70);

  // Winner banner
  ctx.fillStyle = accent;
  ctx.font = "900 56px Georgia, serif";
  ctx.fillText(options.winnerLabel, WIDTH / 2, 150);

  // Avatar — mirrors PlayerCard.tsx: a circular background (from
  // avatarConfig.bg), the base avatar emoji centered, and accessory/clothing
  // emoji layered near the top/bottom of the circle when equipped.
  const avatarCenterY = 300;
  const avatarRadius = 90;
  const avatarBg = options.avatarConfig?.bg
    ? readComputedColor(options.avatarConfig.bg, "backgroundColor")
    : cardBg;
  ctx.save();
  ctx.beginPath();
  ctx.arc(WIDTH / 2, avatarCenterY, avatarRadius, 0, Math.PI * 2);
  ctx.fillStyle = avatarBg;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.clip();

  ctx.font = "90px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(options.avatarEmoji || "🎭", WIDTH / 2, avatarCenterY + 8);
  ctx.restore();
  ctx.textBaseline = "alphabetic";

  if (options.avatarConfig?.accessory && options.avatarConfig.accessory !== "None") {
    ctx.font = "36px sans-serif";
    ctx.fillText(options.avatarConfig.accessory, WIDTH / 2, avatarCenterY - avatarRadius + 30);
  }
  if (options.avatarConfig?.clothing && options.avatarConfig.clothing !== "None") {
    ctx.font = "32px sans-serif";
    ctx.globalAlpha = 0.9;
    ctx.fillText(options.avatarConfig.clothing, WIDTH / 2, avatarCenterY + avatarRadius - 10);
    ctx.globalAlpha = 1;
  }

  // Player name
  ctx.fillStyle = foreground;
  ctx.font = "900 40px Georgia, serif";
  ctx.fillText(options.playerName, WIDTH / 2, 400);

  // Role
  ctx.fillStyle = accent;
  ctx.font = "bold 24px monospace";
  ctx.fillText(options.roleLabel.toUpperCase(), WIDTH / 2, 435);

  // Won/Lost pill
  const pillY = 470;
  ctx.font = "900 30px Georgia, serif";
  ctx.fillStyle = winColor;
  ctx.fillText(options.resultLabel, WIDTH / 2, pillY + 30);

  // Highlights card
  const cardX = 60;
  const cardY = 560;
  const cardW = WIDTH - 120;
  const cardH = 340;
  ctx.fillStyle = cardBg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  const radius = 20;
  ctx.beginPath();
  ctx.moveTo(cardX + radius, cardY);
  ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, radius);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, radius);
  ctx.arcTo(cardX, cardY + cardH, cardX, cardY, radius);
  ctx.arcTo(cardX, cardY, cardX + cardW, cardY, radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = primary;
  ctx.font = "bold 20px monospace";
  ctx.fillText("GAME CHRONICLE", cardX + 30, cardY + 45);

  ctx.fillStyle = foreground;
  ctx.font = "20px Georgia, serif";
  let lineY = cardY + 90;
  const lineHeight = 30;
  const maxLineWidth = cardW - 60;

  const highlightsToRender = options.highlights.length > 0
    ? options.highlights
    : [{ text: "Trust no one. Survive the night." }];

  for (const highlight of highlightsToRender) {
    const wrapped = wrapText(ctx, highlight.text, maxLineWidth);
    for (const line of wrapped) {
      if (lineY > cardY + cardH - 20) break;
      ctx.fillText(line, cardX + 30, lineY);
      lineY += lineHeight;
    }
    lineY += 10;
  }

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = "16px monospace";
  ctx.fillText(options.roomLabel ? `Room ${options.roomLabel}` : "mafiaverse", WIDTH / 2, HEIGHT - 40);

  const dataUrl = canvas.toDataURL("image/png");
  const toBlob = () => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

  return { canvas, toBlob, dataUrl };
}
