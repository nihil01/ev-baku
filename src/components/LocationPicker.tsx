import { useEffect, useRef, useState } from 'react'
import Map, { Marker, NavigationControl, type MapLayerMouseEvent, type MapRef, type MarkerDragEvent } from 'react-map-gl/maplibre'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Lang } from '../types/api'
import './LocationPicker.css'

const BAKU_BOUNDS: [number, number, number, number] = [49.65, 40.25, 50.15, 40.65]
const copy = {
  az: { hint: 'Xəritədə nöqtə seçin və ya cari mövqedən istifadə edin.', current: 'Cari mövqeyim', locating: 'Axtarılır…', outside: 'Mövqe Bakı sərhədlərindən kənardadır.', denied: 'Geolokasiyanı əldə etmək mümkün olmadı.' },
  en: { hint: 'Click the map or drag the marker, or use your current location.', current: 'Use my location', locating: 'Locating…', outside: 'This location is outside Baku.', denied: 'Your location could not be accessed.' },
  ru: { hint: 'Нажмите на карту или перетащите маркер. Можно взять текущую геопозицию.', current: 'Моя геолокация', locating: 'Определяем…', outside: 'Эта точка находится за пределами Баку.', denied: 'Не удалось получить геолокацию.' },
} as const

function inside(longitude: number, latitude: number) {
  return longitude >= 49.65 && longitude <= 50.15 && latitude >= 40.25 && latitude <= 40.65
}

export default function LocationPicker({ lang, latitude, longitude, onChange }: {
  lang: Lang
  latitude: number
  longitude: number
  onChange: (latitude: number, longitude: number) => void
}) {
  const t = copy[lang]
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const mapRef = useRef<MapRef>(null)
  const select = (lat: number, lng: number) => {
    if (!inside(lng, lat)) return setError(t.outside)
    setError('')
    onChange(Number(lat.toFixed(6)), Number(lng.toFixed(6)))
  }
  const locate = () => {
    if (!navigator.geolocation) return setError(t.denied)
    setLocating(true); setError('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocating(false); select(coords.latitude, coords.longitude) },
      () => { setLocating(false); setError(t.denied) },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }
  useEffect(() => {
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: Math.max(mapRef.current.getZoom(), 13), duration: 500 })
  }, [latitude, longitude])
  return <div className="location-picker">
    <div className="location-picker__top"><p>{t.hint}</p><button type="button" onClick={locate} disabled={locating}>◎ {locating ? t.locating : t.current}</button></div>
    {error && <div className="location-picker__error">{error}</div>}
    <div className="location-picker__map">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        workerUrl={workerUrl}
        mapStyle="/map-style.json"
        initialViewState={{ longitude, latitude, zoom: 13 }}
        maxBounds={BAKU_BOUNDS}
        minZoom={10}
        maxZoom={18}
        renderWorldCopies={false}
        onClick={(event: MapLayerMouseEvent) => select(event.lngLat.lat, event.lngLat.lng)}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <Marker longitude={longitude} latitude={latitude} anchor="bottom" draggable onDragEnd={(event: MarkerDragEvent) => select(event.lngLat.lat, event.lngLat.lng)}>
          <span className="location-picker__marker"><i>⌂</i></span>
        </Marker>
      </Map>
    </div>
    <div className="location-picker__coords"><span>{latitude.toFixed(6)}</span><span>{longitude.toFixed(6)}</span></div>
  </div>
}
