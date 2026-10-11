import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { geoUtils } from '../services/geoUtils';

// Default Leaflet icon fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const pinIcon = L.divIcon({
  className: 'custom-map-pin',
  html: `
    <div style="background-color: #4f46e5; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
      <i class="fa-solid fa-location-dot" style="transform: rotate(45deg); color: white; font-size: 16px;"></i>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36]
});

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAddress?: string;
  initialLat?: number;
  initialLng?: number;
  onConfirm: (address: string, coords: { lat: number; lng: number }) => void;
}

// Inner helper to handle click and map centering
const MapClickHandler: React.FC<{
  position: { lat: number; lng: number };
  onLocationChange: (lat: number, lng: number) => void;
}> = ({ position, onLocationChange }) => {
  const map = useMap();

  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    map.flyTo([position.lat, position.lng], map.getZoom(), { duration: 0.8 });
  }, [position.lat, position.lng, map]);

  return (
    <Marker
      position={[position.lat, position.lng]}
      icon={pinIcon}
      draggable={true}
      eventHandlers={{
        dragend(e) {
          const marker = e.target;
          const pos = marker.getLatLng();
          onLocationChange(pos.lat, pos.lng);
        },
      }}
    />
  );
};

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  initialAddress = '',
  initialLat,
  initialLng,
  onConfirm,
}) => {
  const [position, setPosition] = useState<{ lat: number; lng: number }>({
    lat: initialLat || 30.0444, // Cairo default
    lng: initialLng || 31.2357,
  });
  const [address, setAddress] = useState(initialAddress);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLocatingUser, setIsLocatingUser] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAddress(initialAddress || '');
      if (initialLat && initialLng) {
        setPosition({ lat: initialLat, lng: initialLng });
      }
    }
  }, [isOpen, initialAddress, initialLat, initialLng]);

  if (!isOpen) return null;

  const handleLocationChange = async (lat: number, lng: number) => {
    setPosition({ lat, lng });
    setIsFetchingAddress(true);
    try {
      const fetched = await geoUtils.getAddress(lat, lng);
      if (fetched) {
        setAddress(fetched);
      }
    } catch (e) {
      console.warn('Reverse geocoding error', e);
    } finally {
      setIsFetchingAddress(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsFetchingAddress(true);
    try {
      const coords = await geoUtils.getCoordinatesFromAddress(searchQuery.trim());
      if (coords) {
        setPosition(coords);
        setAddress(searchQuery.trim());
      }
    } catch (e) {
      alert('لم يتم العثور على العنوان المحدد');
    } finally {
      setIsFetchingAddress(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsLocatingUser(true);
    try {
      const pos = await geoUtils.getCurrentPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      await handleLocationChange(lat, lng);
    } catch (e) {
      alert('تعذر تحديد موقعك الحالي. يرجى تفعيل الـ GPS والتأكد من إعطاء الصلاحية.');
    } finally {
      setIsLocatingUser(false);
    }
  };

  const handleConfirm = () => {
    onConfirm(address.trim() || `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`, position);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2100] bg-white w-full h-full h-[100dvh] flex flex-col animate-fade-in overflow-hidden">
      {/* Header - Compact Full Width */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex justify-between items-center shrink-0 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs shadow-xs">
            <i className="fa-solid fa-map-location-dot"></i>
          </div>
          <div>
            <h3 className="font-extrabold text-xs">تحديد العنوان والموقع على الخريطة</h3>
            <p className="text-[9px] text-slate-300">انقر على الخريطة أو حرك الدبوس لتحديد الموقع بدقة</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition text-xs"
          title="إغلاق"
        >
          <i className="fa-solid fa-times text-xs"></i>
        </button>
      </div>

      {/* Search & GPS Tool Bar - Compact Buttons */}
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 items-center shrink-0">
        <form onSubmit={handleSearch} className="flex-1 flex gap-1.5 min-w-[180px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن مدينة، منطقة أو شارع..."
            className="flex-1 px-2.5 py-1 bg-white rounded-lg border border-slate-200 text-xs font-medium outline-none focus:border-indigo-600"
          />
          <button
            type="submit"
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shrink-0"
          >
            <i className="fa-solid fa-magnifying-glass text-[10px]"></i>
            <span>بحث</span>
          </button>
        </form>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={isLocatingUser}
          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shrink-0 shadow-xs disabled:opacity-50"
          title="تحديد موقعي الحالي عبر الـ GPS"
        >
          {isLocatingUser ? (
            <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i>
          ) : (
            <i className="fa-solid fa-crosshairs text-[10px]"></i>
          )}
          <span>موقعي الآن</span>
        </button>
      </div>

      {/* Map Canvas - Full Height */}
      <div className="relative flex-1 w-full h-full min-h-0 bg-slate-100">
        <MapContainer
          center={[position.lat, position.lng]}
          zoom={13}
          scrollWheelZoom={true}
          className="w-full h-full"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler
            position={position}
            onLocationChange={handleLocationChange}
          />
        </MapContainer>

        <div className="absolute top-2 right-2 z-[1000] bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-sm border border-slate-200 text-[10px] font-bold text-slate-800 flex items-center gap-1 pointer-events-none">
          <i className="fa-solid fa-hand-pointer text-indigo-600"></i>
          <span>اضغط في أي مكان لتغيير مكان الدبوس</span>
        </div>
      </div>

      {/* Selected Address Display & Confirmation - Compact Footer */}
      <div className="px-3 py-2 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
        <div className="w-full sm:flex-1">
          <div className="relative">
            <span className="absolute right-2.5 top-1.5 text-[10px] font-bold text-slate-400 pointer-events-none">
              العنوان:
            </span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="اسم أو وصف العنوان..."
              className="w-full pr-14 pl-8 py-1 bg-slate-50 rounded-lg border border-slate-200 text-xs font-bold outline-none focus:border-indigo-600"
            />
            {isFetchingAddress && (
              <div className="absolute left-2.5 top-1.5 text-xs text-indigo-600">
                <i className="fa-solid fa-circle-notch fa-spin"></i>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-1.5 w-full sm:w-auto shrink-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 sm:flex-initial px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg shadow-sm transition flex items-center justify-center gap-1"
          >
            <i className="fa-solid fa-check text-[11px]"></i>
            <span>تأكيد الموقع</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;
