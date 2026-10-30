import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { prompt, currentItems } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ 
        reply: "⚠️ Error: GEMINI_API_KEY is missing in your .env.local file or your dev server wasn't restarted!" 
      });
    }

    // 1. GENERAL QUESTION MODE (Passes current 3D layout state as context to Gemma 4)
    if (!prompt.includes('Dataset:\n')) {
      const layoutContext = currentItems && currentItems.length > 0 
        ? `Current items placed in the 3D container: ${JSON.stringify(currentItems)}` 
        : `No items are currently packed in the container.`;

      const response = await ai.models.generateContent({
        model: 'gemma-4-26b-a4b-it',
        contents: [
          `You are an expert AI logistics and 3D cargo packing assistant powered by Gemma 4 (26B). 
          
          ${layoutContext}
          
          User question: "${prompt}"
          
          Answer the user's question directly and intelligently based on the active cargo items above. Be precise.`
        ],
      });

      const aiReply = response.text ? response.text.trim() : "AI response came back empty.";
      return NextResponse.json({ reply: aiReply });
    }

    // 2. DATASET PROCESSING & 3D PACKING LOGIC
    let parsedRows: any[] = [];
    try {
      const parts = prompt.split('Dataset:\n');
      if (parts.length > 1) {
        parsedRows = JSON.parse(parts[1]);
      }
    } catch (e) {
      parsedRows = [];
    }

    const truckTiers = [
      { name: '14-foot truck', length: 420, width: 190, height: 190, volumeM3: 15.63 },
      { name: '17-foot truck', length: 520, width: 210, height: 215, volumeM3: 23.50 },
      { name: '20-foot container', length: 600, width: 230, height: 240, volumeM3: 36.32 },
    ];

    let totalVolumeCm3 = 0;
    const processedItems = parsedRows.map((row: any, index: number) => {
      const keys = Object.keys(row);
      const getVal = (kws: string[], def: number) => {
        const found = keys.find(k => kws.some(kw => k.toLowerCase().includes(kw)));
        return found && !isNaN(Number(row[found])) ? Number(row[found]) : def;
      };

      const dx = getVal(['length', 'len', 'l', 'dx'], 40);
      const dy = getVal(['height', 'ht', 'h', 'dy'], 40);
      const dz = getVal(['width', 'wid', 'w', 'dz'], 40);
      const nameKey = keys.find(k => ['name', 'item', 'box'].some(kw => k.toLowerCase().includes(kw)));
      const name = nameKey ? String(row[nameKey]) : `Box ${index + 1}`;

      totalVolumeCm3 += (dx * dy * dz);
      return { name, dx, dy, dz, volume: dx * dy * dz };
    });

    const totalVolumeM3 = totalVolumeCm3 / 1_000_000;
    const selectedTruck = truckTiers.find(t => t.volumeM3 >= totalVolumeM3) || truckTiers[2];
    processedItems.sort((a, b) => b.volume - a.volume);

    let gemmaSummary = "Layout computed successfully.";
    try {
      const summaryResponse = await ai.models.generateContent({
        model: 'gemma-4-26b-a4b-it',
        contents: `Give a 1-sentence logistics summary for ${processedItems.length} items packed in a ${selectedTruck.name}.`
      });
      if (summaryResponse.text) {
        gemmaSummary = summaryResponse.text.trim();
      }
    } catch (e) {}

    // BIN PACKING ALGORITHM
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const placedItems: any[] = [];
    let unallocatedCount = 0;

    for (let i = 0; i < processedItems.length; i++) {
      const item = processedItems[i];
      let placed = false;
      const coords = [{ x: 0, y: 0, z: 0 }];

      for (const p of placedItems) {
        coords.push({ x: p.x + p.dx, y: p.y, z: p.z });
        coords.push({ x: p.x, y: p.y, z: p.z + p.dz });
        coords.push({ x: p.x, y: p.y + p.dy, z: p.z });
      }

      for (const pos of coords) {
        if (pos.x + item.dx > selectedTruck.length || pos.y + item.dy > selectedTruck.height || pos.z + item.dz > selectedTruck.width) continue;

        let collision = false;
        for (const existing of placedItems) {
          if (pos.x < existing.x + existing.dx && pos.x + item.dx > existing.x &&
              pos.y < existing.y + existing.dy && pos.y + item.dy > existing.y &&
              pos.z < existing.z + existing.dz && pos.z + item.dz > existing.z) {
            collision = true;
            break;
          }
        }

        if (!collision) {
          placedItems.push({ id: `box-${i+1}`, name: item.name, x: pos.x, y: pos.y, z: pos.z, dx: item.dx, dy: item.dy, dz: item.dz, color: colors[i % colors.length] });
          placed = true;
          break;
        }
      }

      if (!placed) unallocatedCount++;
    }

    return NextResponse.json({
      reply: `Analysis Complete:\n\n🚛 **Vehicle:** ${selectedTruck.name}\n🤖 **Gemma 4 (26B):** ${gemmaSummary}\n📦 **Packed:** ${placedItems.length}/${processedItems.length} units.`,
      recommendedTruck: { length: selectedTruck.length, width: selectedTruck.width, height: selectedTruck.height },
      placedItems
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: 'Failed to process optimization logic' }, { status: 500 });
  }
}