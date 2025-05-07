'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    kakao: any;
  }
}

function convertToGrid(lat: number, lon: number) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  const ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  const raCalc = re * sf / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const x = Math.floor(raCalc * Math.sin(theta) + XO + 0.5);
  const y = Math.floor(ro - raCalc * Math.cos(theta) + YO + 0.5);
  return { x, y };
}

function getBaseTimeHourly() {
  const now = new Date();
  const hour = now.getHours();
  const baseHours = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
  for (let i = baseHours.length - 1; i >= 0; i--) {
    if (hour >= parseInt(baseHours[i].slice(0, 2))) {
      return baseHours[i];
    }
  }
  return '2300';
}

function skyDescription(code: string) {
  switch (code) {
    case '1':
      return '☀ 맑음';
    case '3':
      return '⛅ 구름 많음';
    case '4':
      return '☁ 흐림';
    default:
      return '정보 없음';
  }
}

export default function WeatherMapPage() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [weather, setWeather] = useState<any>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState<'idle' | 'loading' | 'done'>('idle');

  const fetchWeather = async (x: number, y: number) => {
    setLoading('loading'); // 1. 시작
    try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const baseDate = `${yyyy}${mm}${dd}`;
    const baseTime = getBaseTimeHourly();

    const serviceKey = '???';

    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${serviceKey}&numOfRows=500&pageNo=1&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${x}&ny=${y}`;

    const res = await fetch(url);
    const json = await res.json();
    const items = json?.response?.body?.items?.item;

    if (!items) {
      console.error('기상청 응답 오류', json);
      setLoading('idle'); // 3. 실패
      return;
    }

    const currentData: Record<string, string> = {};
    const rainData: { time: string; value: string }[] = [];

    for (const item of items) {
      const { category, fcstTime, fcstValue } = item;
      if (['TMP', 'REH', 'WSD', 'SKY'].includes(category)) {
        if (!currentData[category]) currentData[category] = fcstValue;
      }
      if (category === 'POP') {
        rainData.push({ time: fcstTime, value: fcstValue + '%' });
      }
    }

    setWeather({
      temp: currentData.TMP + '°C',
      reh: currentData.REH + '%',
      wsd: currentData.WSD + ' m/s',
      sky: currentData.SKY,
      rain: rainData.slice(0, 8),
    });
    setLoading('done'); // 2. 완료
    } catch (e) {
      console.error(e);
      setLoading('idle');
    }
  };

  useEffect(() => {
    if (window.kakao && mapRef.current) {
      window.kakao.maps.load(() => {
        const map = new window.kakao.maps.Map(mapRef.current, {
          center: new window.kakao.maps.LatLng(37.5665, 126.9780),
          level: 8,
        });

        const geocoder = new window.kakao.maps.services.Geocoder();

        window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.latLng;
          const lat = latlng.getLat();
          const lon = latlng.getLng();
          const { x, y } = convertToGrid(lat, lon);

          fetchWeather(x, y);

          geocoder.coord2Address(lon, lat, (result: any, status: any) => {
            if (status === window.kakao.maps.services.Status.OK) {
              setAddress(result[0].address.address_name);
            }
          });
        });
      });
    }
  }, []);

  return (
    <>
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=???&autoload=false&libraries=services`}
        strategy="beforeInteractive"
      />
      <h2 style={{ fontSize: '24px', marginBottom: '10px' }}>클릭시 날씨 정보 업데이트</h2>
      <div ref={mapRef} style={{ width: '100%', height: '500px', borderRadius: '12px', overflow: 'hidden' }} />

      {loading === 'loading' && (
        <p style={{ textAlign: 'center', fontSize: '18px', marginTop: '20px' }}>📡 날씨 정보를 불러오는 중...</p>
      )}

      {loading === 'done' && weather && (
        <div style={{
          backgroundColor: '#1e1e1e',
          padding: '20px',
          borderRadius: '10px',
          color: '#f0f0f0',
          maxWidth: '800px',
          margin: '30px auto',
          fontSize: '16px',
          lineHeight: 1.6
        }}>
          {address && <p style={{ marginBottom: '12px', fontSize: '24px' }}>📍 위치: {address}</p>}
          <h3 style={{ marginBottom: '10px', fontSize: '20px' }}>🌤 현재 날씨</h3>
          <p>🌡 <strong style={{ color: '#ff6b6b' }}>온도:</strong> {weather.temp}</p>
          <p>💧 <strong>습도:</strong> {weather.reh}</p>
          <p>💨 <strong>풍속:</strong> {weather.wsd}</p>
          <p>☁ <strong>하늘 상태:</strong> {skyDescription(weather.sky)}</p>
        
          <h4 style={{ marginTop: '20px', fontSize: '18px' }}>🌧 24시간 강수확률 (3시간 단위)</h4>
          <ul style={{ paddingLeft: '20px', listStyle: 'square' }}>
            {weather.rain.map((r: any, i: number) => (
              <li key={i} style={{ color: '#61dafb' }}>
                {r.time.slice(0, 2)}시: {r.value}
              </li>
            ))}
          </ul>
        </div>
      )}
      {loading === 'idle' && !weather && (
        <p style={{ textAlign: 'center', fontSize: '16px', marginTop: '20px' }}>🖱 지도를 클릭해 날씨를 조회해보세요</p>
      )}
    </>
  );
}
