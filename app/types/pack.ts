export interface PackItem {
  id: string;
  name: string;
  length: number; // cm
  width: number;  // cm
  height: number; // cm
  weight: number; // kg
  maxTopLoad: number; // kg
  allowedOrientations: ('upright' | 'flat' | 'any')[];
  isFragile: boolean;
}