# NoBu Shooter — art and sound assets

Textures, sprites, effects and sounds for the arena. Vite serves this folder
from the site root (`publicDir` in `client/vite.config.ts`); the manifest is
`client/src/game/assets.ts`. Any file that is missing falls back to the
procedural drawing (`// TEXTURE: <name>` markers in `client/src/game/`) or to
silence, so files can be added or replaced without code changes. How each asset is used: `GAMERULES.md` §17 (look) and §18 (sound).
Sources and licences: `CREDITS.md`.

Owner-supplied 2026-10-10; pruned and renamed in T51 and T57, wired in by Phase 2.5 (T52–T56; see `log.md`).

## Conventions

- Top-down, **facing right** (+x, aim angle 0). The survivor frames already do.
- Frame sequences are folders of `00.png, 01.png, …` (two-digit, zero-padded).
- `_stripN` in a file name means a horizontal strip of N equal frames.
- Pixel-art props (`textures/props/` except `crate_metal.png`), `drone_target.png`
  and the pickup icons need nearest-neighbour or crisp scaling.
- Sounds: mono 16-bit WAV, trimmed, peak-normalised to about −1 to −2 dB
  (`death.ogg` and `dry_fire.mp3` are as supplied).
- Every new file needs a line in `CREDITS.md`; the repo is public.

## Packed player atlas

The game does **not** load `sprites/player/**` frame by frame: `npm run pack-assets`
(`scripts/pack-assets.mjs`) crops, downscales (0.4×) and packs all 245 frames
into `packed/player.png` + `packed/player.json` (2048×1024, Phaser JSON hash)
with a per-frame pivot at the shoulders. Re-run it after changing any frame and
commit both files.

## Inventory

### Sprites

| Path | Used for | Size | Notes |
|---|---|---|---|
| `sprites/player/body/{handgun,rifle,shotgun}/{idle,move,shoot,reload}/` | All players (via `packed/`) | ~255 × 215 per frame | 20 / 20 / 3 / 15–20 frames. Handgun = default; rifle = Rapid Fire; shotgun = Spread Shot. Drawn ~54 px across. |
| `sprites/player/feet/{idle,run,strafe_left,strafe_right}/` | Legs under the body | ~204 × 124 | Chosen by movement direction relative to aim. |
| `sprites/drone_target.png` | `mover_drone` (Compare-view targets) | 24 × 24 | |
| `sprites/pickups/{rapid_fire,spread_shot,shield,speed,piercing,dash}.png` | Power-up icons (§6b) | 64 × 64 | Round badges; transparent corners. `piercing` and `dash` drawn for this project (T59); the Ammo icon was removed with the Ammo power-up. |

### Effects

| Path | Used for | Size | Notes |
|---|---|---|---|
| `fx/bullet.png` | Projectiles | 12 × 3 | Trail stays procedural. |
| `fx/muzzle_flash_strip4.png` | Muzzle flash | 4 × 128 × 128 | White, tinted; one random frame per shot. |
| `fx/spark_strip9.png` | Hit / death particles | 9 × 32 × 32 | |
| `fx/shield_bubble.png` | Spawn protection + Shield power-up | 269 × 269 | Grey sphere; tinted and translucent. |

### Textures

| Path | Used for | Size |
|---|---|---|
| `textures/floors/stone_cracked.png` | `warehouse` floor | 128 × 128 tile |
| `textures/floors/stone_beige.png` | `plaza` floor | 1024 × 1024 (downscaled from 2048) |
| `textures/floors/brick_herringbone.png` | `overgrown` floor | 256 × 256 tile |
| `textures/props/crate_metal.png` | Square obstacles | 500 × 500 |
| `textures/props/{box_storage,cage_storage,barrier_metal,barrel_oil,barrel_toxic,cabinet_electric_1,cabinet_electric_2,tank_fuel}.png` | Map obstacles | 22–48 px pixel art |

The `neon` map keeps its procedural grid and glowing glass obstacles.

### Sounds (`sfx/`)

| File | Event | Length | From (original file) |
|---|---|---|---|
| `shoot_handgun.wav` | Handgun shot | 0.35 s | `22 Pistol.wav` (first shot) |
| `shoot_rifle.wav` | Rifle shot; shotgun = same file at 0.7× rate | 0.50 s | `pistol realistic.wav` (first shot) |
| `reload_handgun.wav` | Handgun reload | 1.38 s | `gunreload1.wav` |
| `reload_rifle.wav` | Rifle reload | 1.28 s | `assaultriflereload1.wav` |
| `reload_shotgun.wav` | Shotgun reload | 0.47 s | `shotguncock.wav` |
| `dry_fire.mp3` | Fire with an empty magazine / while reloading | — | `gun_reload_lock_or_click_sound.mp3` |
| `hit.wav` | Shield absorbs a hit | 0.11 s | `bullet hitting idk.wav` |
| `death.ogg` | Elimination | — | `death sound.ogg` |
| `pickup.wav` | Power-up collected | 0.15 s | `SFX_Powerup_49.wav` |

Respawn, power-up end and UI clicks are **silent** (owner decision).

## Still wanted

Nothing. Optional extras: a dedicated shotgun blast sound (`sfx/shoot_shotgun.wav`;
until then the rifle shot is pitched down), and `.ogg` copies of the WAVs if
size matters.
