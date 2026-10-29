'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';

interface PlacedItem {
  id: string;
  name: string;
  x: number; y: number; z: number; // Position (cm)
  dx: number; dy: number; dz: number; // Dimensions (cm)
  color?: string;
}

interface TruckProps {
  truckDim: { length: number; width: number; height: number };
  items: PlacedItem[];
  stepIndex: number;
}

export default function TruckViewer({ truckDim, items, stepIndex }: TruckProps) {
  // Filter items based on active loading step
  const visibleItems = items.slice(0, stepIndex + 1);

  return (
    <div className="w-full h-[600px] bg-slate-900 rounded-xl overflow-hidden">
      <Canvas camera={{ position: [truckDim.length * 1.5, truckDim.height * 2, truckDim.width * 2], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[100, 200, 100]} intensity={1} />
        <OrbitControls makeDefault />

        {/* Truck Container Wireframe Outline */}
        <mesh position={[truckDim.length / 2, truckDim.height / 2, truckDim.width / 2]}>
          <boxGeometry args={[truckDim.length, truckDim.height, truckDim.width]} />
          <meshBasicMaterial wireframe color="#64748b" />
        </mesh>

        {/* Placed Cargo Boxes */}
        {visibleItems.map((item) => (
          <mesh 
            key={item.id} 
            position={[
              item.x + item.dx / 2, 
              item.y + item.dy / 2, 
              item.z + item.dz / 2
            ]}
          >
            <boxGeometry args={[item.dx, item.dy, item.dz]} />
            <meshStandardMaterial color={item.color || '#3b82f6'} opacity={0.9} transparent />
            <Edges color="#1e293b" />
            <Text
              position={[0, 0, item.dz / 2 + 1]}
              fontSize={Math.min(item.dx, item.dy) * 0.15}
              color="white"
            >
              {item.name}
            </Text>
          </mesh>
        ))}
      </Canvas>
    </div>
  );
}