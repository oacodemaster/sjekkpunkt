// The practice demo (/play): sample parcels anyone can pack on screen, with the generated product
// photos in public/sample (docs/generated-images.md). Pure data: the products are the seed's own
// (same SKUs, names, sizes and barcodes), so the engine and the voice coach see a normal order.

import type { Order, PackAlert, Product } from '@/lib/engine/types';
import { PRODUCTS } from '@/lib/demo/seed';

/** One photo per look. Sizes of the same garment share a photo: the size is on the label. */
export const PLAY_IMAGE: Record<string, string> = {
  'HD-NAVY-M': 'hoodie-navy',
  'HD-BLACK-M': 'hoodie-black',
  'SK-WOOL-40': 'socks-wool-grey',
  'SK-WOOL-36': 'socks-wool-grey',
  'SK-RUN-40': 'socks-run-white',
  'JK-SHELL-M': 'jacket-shell-green',
  'JK-SHELL-L': 'jacket-shell-green',
  'CP-BEANIE': 'beanie-orange',
  'TS-WHITE-S': 'tee-white',
  'TS-WHITE-M': 'tee-white',
  'TS-WHITE-L': 'tee-white',
  'TS-BLACK-M': 'tee-black',
  'CA-BLACK': 'cap-black',
  'CA-NAVY': 'cap-navy',
  'RJ-YELLOW-M': 'rain-yellow',
  'RJ-YELLOW-L': 'rain-yellow',
  'SC-RED': 'scarf-red',
  'JN-BLUE-30': 'jeans-blue',
  'JN-BLUE-32': 'jeans-blue',
  'JN-BLUE-34': 'jeans-blue',
  'WB-STEEL': 'bottle-steel',
  'MT-GREY': 'mittens-grey',
};

export const imageOf = (sku: string) => `/sample/products/${PLAY_IMAGE[sku] ?? 'box-open'}.webp`;

/** The closed set for the practice demo: every product a shelf can hold. */
export const PLAY_PRODUCTS: Product[] = PRODUCTS.filter((p) => p.sku in PLAY_IMAGE);

/** What the parcel teaches; shown on its card and in the intro. */
export type PlayLesson = 'easy' | 'colour' | 'size' | 'alert' | 'big';

export interface PlayParcel {
  order: Order;
  lesson: PlayLesson;
  /** what is on the shelf next to the bench: the order's items and the ones they get mixed up with */
  shelf: string[];
  /** a pack alert already active for this parcel (the loop from earlier mix-ups) */
  alerts: PackAlert[];
}

const price = (sku: string) => PLAY_PRODUCTS.find((p) => p.sku === sku)!.priceNok;
const order = (id: string, lines: [string, number][]): Order => ({
  id,
  customerRef: `Testkunde ${id}`,
  status: 'picked',
  lines: lines.map(([sku, qty]) => ({ sku, qty, priceNok: price(sku) })),
});

export const PLAY_PARCELS: PlayParcel[] = [
  {
    order: order('4101', [
      ['CP-BEANIE', 1],
      ['SC-RED', 1],
    ]),
    lesson: 'easy',
    shelf: ['MT-GREY', 'CP-BEANIE', 'WB-STEEL', 'SC-RED', 'CA-BLACK', 'SK-RUN-40'],
    alerts: [],
  },
  {
    order: order('4102', [
      ['HD-NAVY-M', 1],
      ['SK-WOOL-40', 1],
    ]),
    lesson: 'colour',
    shelf: ['HD-BLACK-M', 'SK-WOOL-36', 'HD-NAVY-M', 'SK-RUN-40', 'SK-WOOL-40', 'CA-NAVY'],
    alerts: [],
  },
  {
    order: order('4103', [
      ['TS-WHITE-M', 2],
      ['CA-BLACK', 1],
    ]),
    lesson: 'size',
    shelf: ['TS-WHITE-L', 'CA-NAVY', 'TS-WHITE-M', 'TS-BLACK-M', 'TS-WHITE-S', 'CA-BLACK'],
    alerts: [],
  },
  {
    order: order('4104', [['JK-SHELL-L', 1]]),
    lesson: 'alert',
    shelf: ['JK-SHELL-M', 'RJ-YELLOW-L', 'JK-SHELL-L', 'HD-BLACK-M'],
    alerts: [
      {
        skuPair: ['JK-SHELL-L', 'JK-SHELL-M'],
        rule: 'REQUIRE_LABEL_PHOTO',
        reasonNb: 'Skalljakke M/L forvekslet 3 ganger siste 7 dager',
        createdAt: '2026-11-07T08:00:00.000Z',
        active: true,
        origin: 'auto',
      },
    ],
  },
  {
    order: order('4105', [
      ['JN-BLUE-32', 1],
      ['RJ-YELLOW-M', 1],
      ['MT-GREY', 1],
    ]),
    lesson: 'big',
    shelf: ['JN-BLUE-30', 'RJ-YELLOW-L', 'MT-GREY', 'JN-BLUE-32', 'WB-STEEL', 'RJ-YELLOW-M', 'JN-BLUE-34', 'SC-RED'],
    alerts: [],
  },
];

export const parcelById = (id: string) => PLAY_PARCELS.find((p) => p.order.id === id);
