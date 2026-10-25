# Fabrics

A real-time textile playground in the browser. Pull pinch-pleated curtains along their rod, fly a flag, drape a velvet
robe over a dress form, scrunch a Persian rug, yank a tablecloth off a table, or throw balls of yarn into a hammock.

Live: https://fabrics.gzowo.fun

## What you can do

| Tool | What it does |
|---|---|
| Grab | Pinch and pull the fabric. Drag empty space to orbit, scroll or pinch to zoom. Scroll while holding to push the fabric away. |
| Pin | Stick a pin in the fabric to hang it from that point. Tap the pin again to pull it out. "Let go of everything" drops it all, rod included. |
| Cut | Swipe across the fabric to cut it. Fabric also tears by itself when stretched too far (chiffon tears first, denim last). |
| Burn | Set the fabric alight. Fire spreads faster upwards, chars the edges and eats holes. Wool chars and puts itself out. |
| Dye | Drop dye that bleeds into the weave and leaves a tide line. Dyes mix subtractively: indigo over weld goes green. |
| Wind | Hold to blow a cone of air where you point. |
| Yarn | Throw balls of yarn that bounce off and sink into the cloth. |

Six fabrics with their own physics and look: silk (anisotropic sheen, slippery), chiffon (sheer, floaty, tears easily),
linen, velvet (sheen, heavy), denim (stiff twill) and wool (knit, hard to burn). Nine procedural prints (solid, stripes,
gingham, tartan, houndstooth, dots, damask, Persian medallion, shibori), any colour, adjustable print scale.

Studio settings: breeze, gravity (zero, Moon, Earth, Jupiter), slow motion, a thread tension view where stretched
threads glow, tilt-your-phone gravity and blow-into-the-mic wind.

## How it works

- `src/cloth.js`: hand-written XPBD cloth (structural, shear and bending distance constraints, small substeps, alternating
  Gauss-Seidel order), tearing with dependent-constraint cleanup, screen-space cutting, burning that spreads along
  threads, sliding curtain rings with static friction, pleat memory, sphere/capsule/cylinder/box colliders, hashed
  self-collision and two-way contact with the yarn balls. Aerodynamics are per triangle.
- `src/fabrics.js`: fabric presets and a `MeshPhysicalMaterial` patched for burn holes, embers, weave shading and a
  paler fabric back side.
- `src/textures.js`: canvas prints, weave normal maps (plain, twill, satin, knit, pile) and dye layers.
- `src/scenes.js`, `src/main.js`, `src/audio.js`: scenes, studio, tools, UI, sensors and sound.

three.js 0.170 from a CDN, no build step. Serve the folder with any static server, for example
`python3 Niepotrzebne/tools/serve.py 8731`, then open http://localhost:8731 (add `?scene=flag` and so on to jump in).

## Sound credits

All sounds are CC0 (public domain) recordings from freesound.org, trimmed and looped by `Niepotrzebne/tools/audio.sh`:

| File | Source |
|---|---|
| rustle | "Cloth Rustle 6" by zazz.sound.design (freesound 435293) |
| flap | "Cloth Flapping On A Clothesline Thickly" by leonelmail (330638) |
| wind | "wind 8" by ZIP.Creates (726319) |
| fire | "Fire Crackle and Flames 002" by TheWoodlandNomad (363092) |
| snip1, snip2 | "Scissors" by randbsoundbites (792416) |
| tear1 | "Tearing fabric" by melle_teich (565970) |
| tear2 | "SFX_STICKERRIPPER_fabric_14" by MrFossy (590318) |
| ignite | "Match strike 03" by scalywhale (423811) |
| thud1 | "Soft Impact - Pillow Hit" by KoimeMatsuchiya (872227) |
| thud2 | "Pillow Flump" by trinitrotoluenedev (728541) |
| drip | "Water Drip 2" by magnuswaker (524217) |

Made in Gzowo by Gzowo Labs.
