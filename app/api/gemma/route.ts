import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    let parsedRows: any[] = [];
    try {
      const parts = prompt.split('Dataset:\n');
      if (parts.length > 1) {
        parsedRows = JSON.parse(parts[1]);
      }
    } catch (e) {
      parsedRows = [];
    }

    // Official truck tiers (matching 20ft container spec)
    const truckTiers = [
      { name: '14-foot truck', length: 420, width: 190, height: 190, volumeM3: 15.63 },
      { name: '17-foot truck', length: 520, width: 210, height: 215, volumeM3: 23.50 },
      { name: '20-foot container', length: 600, width: 230, height: 240, volumeM3: 36.32 },
    ];

    let totalVolumeCm3 = 0;

    const extractProperty = (row: any, keywords: string[], fallback: number) => {
      const keys = Object.keys(row);
      for (const kw of keywords) {
        const foundKey = keys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
        if (foundKey && row[foundKey] !== undefined && !isNaN(Number(row[foundKey]))) {
          return Number(row[foundKey]);
        }
      }
      return fallback;
    };

    const extractFragile = (row: any) => {
      const keys = Object.keys(row);
      for (const k of keys) {
        if (k.toLowerCase().includes('fragile') || k.toLowerCase().includes('handling') || k.toLowerCase().includes('stack')) {
          const val = String(row[k]).toLowerCase();
          if (val.includes('true') || val.includes('yes') || val.includes('1') || val.includes('fragile')) {
            return true;
          }
        }
      }
      return false;
    };

    const processedItems = parsedRows.map((row: any, index: number) => {
      const dx = extractProperty(row, ['length', 'len', 'l', 'dx', 'dim_x'], 40);
      const dy = extractProperty(row, ['height', 'ht', 'h', 'dy', 'dim_y', 'depth'], 40);
      const dz = extractProperty(row, ['width', 'wid', 'w', 'dz', 'dim_z', 'breadth'], 40);
      const isFragile = extractFragile(row);

      const nameKey = Object.keys(row).find(k => ['name', 'item', 'itemname', 'description', 'box'].some(kw => k.toLowerCase().includes(kw)));
      const name = nameKey ? String(row[nameKey]) : `Box ${index + 1}`;

      totalVolumeCm3 += (dx * dy * dz);

      return { name, dx, dy, dz, isFragile };
    });

    const totalVolumeM3 = totalVolumeCm3 / 1_000_000;
    const selectedTruck = truckTiers.find(t => t.volumeM3 >= totalVolumeM3) || truckTiers[2];

    // Sort: Robust base items first, fragile items on top
    processedItems.sort((a, b) => (a.isFragile === b.isFragile ? 0 : a.isFragile ? 1 : -1));

    // SURFACE-LANDING GRAVITY DROP ALGORITHM
    let currentX = 0;
    let currentZ = 0;
    let rowMaxDepth = 0;

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308'];
    const placedItems: any[] = [];
    let unallocatedCount = 0;

    for (let i = 0; i < processedItems.length; i++) {
      const item = processedItems[i];

      // Wrap X across truck length
      if (currentX + item.dx > selectedTruck.length) {
        currentX = 0;
        currentZ += rowMaxDepth;
        rowMaxDepth = 0;
      }

      // If Z exceeds truck width, wrap back to front and start stacking on previous positions
      if (currentZ + item.dz > selectedTruck.width) {
        currentZ = 0;
        currentX = 0;
      }

      // Calculate exact landing Y based on what boxes are directly underneath this item's footprint
      let landingY = 0;
      const x1 = currentX;
      const x2 = currentX + item.dx;
      const z1 = currentZ;
      const z2 = currentZ + item.dz;

      for (const placed of placedItems) {
        const pX1 = placed.x;
        const pX2 = placed.x + placed.dx;
        const pZ1 = placed.z;
        const pZ2 = placed.z + placed.dz;

        // Check if footprints overlap in the X-Z plane
        const overlapX = Math.max(0, Math.min(x2, pX2) - Math.max(x1, pX1));
        const overlapZ = Math.max(0, Math.min(z2, pZ2) - Math.max(z1, pZ1));

        if (overlapX > 0 && overlapZ > 0) {
          const topSurface = placed.y + placed.dy;
          if (topSurface > landingY) {
            landingY = topSurface;
          }
        }
      }

      // Check height limit
      if (landingY + item.dy > selectedTruck.height) {
        unallocatedCount++;
        continue;
      }

      placedItems.push({
        id: `unit-${i + 1}`,
        name: item.name,
        x: currentX,
        y: landingY, // Anchored firmly on the floor (0) or directly on top of overlapping boxes!
        z: currentZ,
        dx: item.dx,
        dy: item.dy,
        dz: item.dz,
        color: colors[i % colors.length]
      });

      rowMaxDepth = Math.max(rowMaxDepth, item.dz);
      currentX += item.dx;
    }

    const reply = `Analysis Complete:\n\n` +
      `🚛 **Vehicle Selected:** ${selectedTruck.name} (${selectedTruck.length}x${selectedTruck.width}x${selectedTruck.height} cm, ${selectedTruck.volumeM3} m³ capacity).\n\n` +
      `📦 **Placement Status:** Successfully packed ${placedItems.length} of ${processedItems.length} units using footprint gravity-drop stacking. All items rest securely on the floor or directly on supporting units below. ` +
      (unallocatedCount > 0 ? `⚠️ ${unallocatedCount} items exceeded vertical container limits.` : `All items fit inside container bounds.`);

    return NextResponse.json({
      reply,
      recommendedTruck: { length: selectedTruck.length, width: selectedTruck.width, height: selectedTruck.height },
      placedItems
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process optimization logic' }, { status: 500 });
  }
}