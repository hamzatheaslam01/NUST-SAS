import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useClasses } from '../../hooks/useClasses';
import { useCreateSession } from '../../hooks/useSessions';
import { ArrowLeft, MapPin, AlertCircle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const NUST_LOCATION = { lat: 33.6427, lng: 72.9905 };

function LocationPicker({ position, setPosition }: any) {
  useMapEvents({
    click(e) {
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return position ? <Marker position={[position.lat, position.lng]} /> : null;
}

function MapUpdater({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center, map]);
  return null;
}

export default function CreateSessionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedClassId = searchParams.get('classId');

  const { data: classes } = useClasses();
  const createSession = useCreateSession();

  const [classId, setClassId] = useState(preselectedClassId || '');
  const [duration, setDuration] = useState('60');
  const [location, setLocation] = useState<{ lat: number; lng: number }>(NUST_LOCATION);
  const [geofenceRadius, setGeofenceRadius] = useState('50');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [savedLocations, setSavedLocations] = useState<{ name: string, lat: number, lng: number }[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('nust_saved_locations');
    if (saved) {
      try {
        setSavedLocations(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved locations', e);
      }
    }
  }, []);

  const saveCurrentLocation = () => {
    if (!location) return;
    const name = prompt("Enter a name for this location (e.g., 'SEECS Lab 3')");
    if (name) {
      const newSaved = [...savedLocations, { name, lat: location.lat, lng: location.lng }];
      setSavedLocations(newSaved);
      localStorage.setItem('nust_saved_locations', JSON.stringify(newSaved));
    }
  };

  const detectLocation = () => {
    setDetectingLocation(true);
    setLocationError(null);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setDetectingLocation(false);
        },
        (error) => {
          console.error('Geolocation error:', error);
          setLocationError('Location detection failed. Using default NUST location.');
          setLocation(NUST_LOCATION);
          setDetectingLocation(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      setLocationError('Geolocation not supported. Using default NUST location.');
      setLocation(NUST_LOCATION);
      setDetectingLocation(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!classId || !location) {
      alert('Please select a class and set location');
      return;
    }

    try {
      const session = await createSession.mutateAsync({
        class_id: classId,
        latitude: location.lat,
        longitude: location.lng,
        radius: parseInt(geofenceRadius),
        duration_minutes: parseInt(duration),
      });

      navigate(`/sessions/${session.session_id}`);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to create session');
    }
  };

  const classOptions = classes?.map((c) => ({
    value: c.id!,
    label: `${c.course_code} - ${c.course_name}`,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/classes')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Start New Session</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Session Configuration</CardTitle>
            <CardDescription>Set up your attendance session</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Class</label>
                <Select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  options={classOptions}
                  placeholder="Select a class..."
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Duration (minutes)</label>
                <div className="flex gap-2">
                  {[50, 80, 110].map((mins) => (
                    <Button
                      key={mins}
                      type="button"
                      variant={duration === mins.toString() ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDuration(mins.toString())}
                      className="flex-1 text-xs h-8"
                    >
                      {mins}m Class
                    </Button>
                  ))}
                </div>
                <Input
                  type="number"
                  min="5"
                  max="300"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                />
              </div>

              {savedLocations.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Saved Locations</label>
                  <Select
                    value=""
                    onChange={(e: any) => {
                      const idx = parseInt(e.target.value);
                      if (!isNaN(idx) && savedLocations[idx]) {
                        setLocation(savedLocations[idx]);
                      }
                    }}
                    options={[
                      { label: 'Select a saved location...', value: '' },
                      ...savedLocations.map((l, i) => ({ label: l.name, value: i.toString() }))
                    ]}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Geofence Radius (meters)</label>
                <Input
                  type="number"
                  min="10"
                  max="100"
                  value={geofenceRadius}
                  onChange={(e) => setGeofenceRadius(e.target.value)}
                  required
                />
              </div>

              {locationError && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  {locationError}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={detectLocation}
                  disabled={detectingLocation}
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  {detectingLocation ? 'Detecting...' : 'Detect Location'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveCurrentLocation}
                  disabled={!location}
                >
                  Save Preset
                </Button>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={createSession.isPending || !location}>
                  {createSession.isPending ? 'Starting...' : 'Start Session'}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate('/classes')}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session Location</CardTitle>
            <CardDescription>
              {location
                ? `Lat: ${location.lat.toFixed(6)}, Lng: ${location.lng.toFixed(6)}`
                : 'Default Location'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-96 rounded-lg overflow-hidden border">
              {location ? (
                <MapContainer
                  center={[location.lat, location.lng]}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  <LocationPicker position={location} setPosition={setLocation} />
                  <MapUpdater center={location} />
                </MapContainer>
              ) : (
                <div className="flex items-center justify-center h-full bg-slate-100">
                  <p className="text-slate-500">Loading map...</p>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">Click on the map to adjust location</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
