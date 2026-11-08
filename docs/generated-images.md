# Generated images (Media Master)

Every image in `public/sample/` was generated on 2026-11-08 with Media Master (`../Media Master`, `POST /api/generate`,
model `gpt-image-2.5-sunburst`) and converted to WebP with `cwebp` (products 512 px, box and parcel 800 px, scenes
1280 px wide). 21 generations, all kept (the navy hoodie was the test shot). Sizes of one garment share a photo on
purpose (docs/decisions.md, 2026-11-08). To remake one, run the prompt below and convert it the same way.

Products and the box: `size=1024x1024`, `quality=medium`, `background=transparent`, `output_format=png`. Scenes:
`size=1536x1024`, `quality=high`, `background=opaque`.

Product prompt: "Professional e-commerce product photo of a single **{item}**. Shot straight from above as a top-down
flat lay, centred, filling about 70% of the frame with even margins. Soft even studio light, realistic texture, a faint
natural contact shadow. No logos, no printed text, no visible labels or tags. Isolated on a fully transparent background."
(The navy hoodie used "filling about 80% of the frame".)

| File | {item} | Used for (SKUs) |
|---|---|---|
| `products/hoodie-navy.webp` | navy blue cotton hooded sweatshirt (hoodie), neatly folded with the hood on top | HD-NAVY-M |
| `products/hoodie-black.webp` | black cotton hooded sweatshirt (hoodie), neatly folded with the hood on top | HD-BLACK-M |
| `products/socks-wool-grey.webp` | pair of grey knitted wool socks, folded together side by side | SK-WOOL-40, SK-WOOL-36 |
| `products/socks-run-white.webp` | pair of white athletic running socks, folded together side by side | SK-RUN-40 |
| `products/jacket-shell-green.webp` | forest green waterproof hiking shell jacket, neatly folded with the hood and the front zip visible | JK-SHELL-M, JK-SHELL-L |
| `products/beanie-orange.webp` | bright orange ribbed knit beanie hat, laid flat | CP-BEANIE |
| `products/tee-white.webp` | white crew-neck cotton T-shirt, neatly folded into a rectangle | TS-WHITE-S/M/L |
| `products/tee-black.webp` | black crew-neck cotton T-shirt, neatly folded into a rectangle | TS-BLACK-M |
| `products/cap-black.webp` | plain black baseball cap, seen from above at a slight angle | CA-BLACK |
| `products/cap-navy.webp` | plain navy blue baseball cap, seen from above at a slight angle | CA-NAVY |
| `products/rain-yellow.webp` | bright yellow rain jacket with a hood, neatly folded | RJ-YELLOW-M/L |
| `products/scarf-red.webp` | red knitted wool scarf, loosely folded | SC-RED |
| `products/jeans-blue.webp` | pair of classic mid-blue denim jeans, neatly folded | JN-BLUE-30/32/34 |
| `products/bottle-steel.webp` | brushed stainless steel insulated water bottle lying on its side | WB-STEEL |
| `products/mittens-grey.webp` | pair of grey knitted wool mittens, side by side | MT-GREY |

Box and parcel (transparent, 1024×1024, medium):
- `box-open.webp`: "Top-down photo of an empty open corrugated cardboard shipping box, about 40 x 30 cm, seen straight from above with all four flaps folded outwards, the clean empty brown inside of the box clearly visible and filling most of the frame. Soft even studio light. No tape, no labels, no printed text. Isolated on a fully transparent background."
- `parcel-sealed.webp`: "A closed cardboard shipping box sealed with clear packing tape, seen at a three-quarter angle from above, with a small round plain green sticker on the top. Soft studio light. No printed text, no barcode, no logos. Isolated on a fully transparent background."

Scenes (1536×1024, high). Each prompt ends with "Photorealistic, natural colours, soft daylight, shallow depth of
field. No readable text, no logos, no brand names anywhere. No faces."
- `scenes/packing.webp`: "A packing bench in a bright Scandinavian e-commerce warehouse. Seen over the shoulder, two hands hold a rugged handheld warehouse device pointed down at an open cardboard box. In the box: a folded navy blue hoodie and a pair of grey wool socks. The device screen shows a camera view of the box with a thin green rectangle around each item and a large green check mark. Tape dispenser and a stack of flat boxes on the bench, tall shelving softly blurred behind."
- `scenes/returns.webp`: "A returns inspection bench in a bright Scandinavian warehouse. A forest green shell jacket lies opened on the bench next to an opened returned parcel. One hand gently holds the inside collar to show the small fabric size tag, the other hand holds a rugged handheld device taking a close-up photo of that tag; the device screen shows the tag inside a thin amber frame. Shelving softly blurred behind."
- `scenes/lead.webp`: "A shift team lead seen from behind over the shoulder, standing at a high desk in a bright warehouse office area, looking at a tablet that shows a clean dashboard of simple cards with green, amber and red status dots and a small bar chart. Warehouse shelving and packing benches softly blurred in the background."
- `scenes/voice.webp`: "Close-up of a warehouse worker's hand holding a rugged handheld device at chest height near a packing bench, thumb pressing a large round on-screen talk button; small sound-wave bars glow on the screen and two short speech bubbles with no readable text. An open cardboard box is softly blurred in front."
