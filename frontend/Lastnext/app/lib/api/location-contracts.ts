export interface PropertyRef {
  id: number;
  property_id: string;
  name: string;
}

export interface RoomRef {
  room_id: number;
  name: string;
  room_type: string;
  properties: string[];
}

export interface PropertyApiResponse extends PropertyRef {
  tenant: number | null;
  tenant_name?: string;
  description: string | null;
  users: number[];
  created_at: string;
  rooms: RoomRef[];
  is_preventivemaintenance: boolean | null;
}

export interface PropertyWritePayload {
  name: string;
  tenant?: number | null;
  description?: string | null;
  users?: number[];
}

export interface PropertyPatchPayload {
  name?: string;
  tenant?: number | null;
  description?: string | null;
  users?: number[];
}

export interface RoomApiResponse {
  room_id: number;
  name: string;
  room_type: string;
  is_active: boolean;
  created_at: string;
  properties: number[];
}

export interface RoomWritePayload {
  name: string;
  room_type: string;
  is_active?: boolean;
  properties?: number[];
}

export interface RoomPatchPayload {
  name?: string;
  room_type?: string;
  is_active?: boolean;
  properties?: number[];
}

export interface RoomQuery {
  property?: string;
  property_id?: string;
  area?: number;
  area_id?: number;
  floor?: string;
  floors_only?: boolean;
  is_active?: boolean;
}

export interface RoomFloorsResponse {
  floors: string[];
}

export interface AreaRef {
  id: number;
  name: string;
  is_active: boolean;
  property_id: string;
  property_name: string;
}

export interface AreaApiResponse {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  property: number;
  property_name: string;
  property_uuid: string;
  jobs_count: number;
  created_at: string;
  updated_at: string;
}

export interface AreaWritePayload {
  name: string;
  property_id: number;
  description?: string | null;
  is_active?: boolean;
}

export interface AreaPatchPayload {
  name?: string;
  property_id?: number;
  description?: string | null;
  is_active?: boolean;
}

export interface AreaQuery {
  property?: string;
  property_id?: string;
  is_active?: boolean;
  search?: string;
}
