/**
 * SunCalc.js - Calculo de posicion solar
 * Algoritmo basado en "Astronomical Algorithms" (Jean Meeus)
 * y el modelo de la NOAA (Solar Calculator)
 */

const SunCalc = (() => {
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  /**
   * Convierte fecha a Julian Day
   */
  function toJulian(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day =
      date.getDate() +
      date.getHours() / 24 +
      date.getMinutes() / 1440 +
      date.getSeconds() / 86400;

    let y = year;
    let m = month;
    if (m <= 2) {
      y -= 1;
      m += 12;
    }

    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);

    return (
      Math.floor(365.25 * (y + 4716)) +
      Math.floor(30.6001 * (m + 1)) +
      day +
      B -
      1524.5
    );
  }

  /**
   * Calcula posicion del sol: azimuth y altitud
   *
   * @param {Date} date - Fecha y hora local
   * @param {number} lat - Latitud en grados (-90 a 90)
   * @param {number} lon - Longitud en grados (-180 a 180)
   * @returns {{ azimuth: number, altitude: number }}
   *   azimuth: 0 = Norte, 90 = Este, 180 = Sur, 270 = Oeste
   *   altitude: -90 a 90 (negativo = bajo horizonte)
   */
  function getPosition(date, lat, lon) {
    const JD = toJulian(date);
    const T = (JD - 2451545.0) / 36525; // Siglos julianos desde J2000

    // --- Geometria solar ---

    // Anomalia media del sol (grados)
    const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    const Mrad = M * DEG;

    // Longitud media del sol (grados)
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;

    // Ecuacion del centro
    const C =
      (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
      0.000289 * Math.sin(3 * Mrad);

    // Longitud verdadera del sol (grados)
    const L = L0 + C;
    const Lrad = L * DEG;

    // Oblicuidad de la ecliptica (grados)
    const Obl = 23.439291 - 0.01300417 * T;
    const OblRad = Obl * DEG;

    // Ascension recta (grados)
    const sinL = Math.sin(Lrad);
    const cosL = Math.cos(Lrad);
    const RA = Math.atan2(Math.cos(OblRad) * sinL, cosL) * RAD;

    // Declinacion (grados)
    const sinDec = Math.sin(OblRad) * sinL;
    const cosDec = Math.sqrt(1 - sinDec * sinDec);
    const Dec = Math.atan2(sinDec, cosDec) * RAD;

    // --- Angulo horario ---

    // Ecuacion del tiempo (minutos)
    // Fórmula: EoT = 4 * (L0 - RA)  (en minutos de arco, convertido a minutos de tiempo)
    // Pero L0 y RA deben estar en el mismo rango (0-360)
    let eot = L0 - RA;
    if (eot > 180) eot -= 360;
    if (eot < -180) eot += 360;
    eot = eot * 4; // convertir a minutos de tiempo

    // Tiempo solar verdadero (minutos desde medianoche)
    const utcOffset = -date.getTimezoneOffset(); // minutos, positivo = este
    const timeMinutes =
      date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    const trueSolarTime = timeMinutes + 4 * lon + eot - utcOffset;

    // Angulo horario (grados)
    const HA = ((trueSolarTime / 60 - 12) * 15 + 360) % 360;
    const HArad = HA * DEG;

    // --- Altitud ---
    const latRad = lat * DEG;
    const sinAlt =
      Math.sin(latRad) * sinDec + Math.cos(latRad) * cosDec * Math.cos(HArad);
    const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD;

    // --- Azimuth ---
    // Fórmula del azimuth desde el sur, girado a desde el norte
    const cosAz =
      (sinDec - Math.sin(latRad) * Math.sin(altitude * DEG)) /
      (Math.cos(latRad) * Math.cos(altitude * DEG));

    let azimuth;
    if (Math.sin(HArad) > 0) {
      // Sol al oeste (tarde)
      azimuth = (360 - Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD) % 360;
    } else {
      // Sol al este (mañana)
      azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
    }

    return { azimuth, altitude };
  }

  /**
   * Calcula orto, ocaso y mediodia solar
   */
  function getTimes(date, lat, lon) {
    // Calcular el offset UTC de la fecha
    const utcOffset = -date.getTimezoneOffset(); // minutos, positivo = este

    const JD = toJulian(
      new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0),
    );
    const T = (JD - 2451545.0) / 36525;

    const M = 357.52911 + 35999.05029 * T;
    const L0 = 280.46646 + 36000.76983 * T;
    const Mrad = M * DEG;

    const C =
      (1.914602 - 0.004817 * T) * Math.sin(Mrad) +
      0.019993 * Math.sin(2 * Mrad) +
      0.000289 * Math.sin(3 * Mrad);

    const L = L0 + C;
    const Lrad = L * DEG;
    const Obl = 23.439291 - 0.01300417 * T;

    const sinL = Math.sin(Lrad);
    const cosL = Math.cos(Lrad);
    const cosObl = Math.cos(Obl * DEG);
    const RA = Math.atan2(cosObl * sinL, cosL) * RAD;

    const sinDec = Math.sin(Obl * DEG) * sinL;
    const Dec = Math.atan2(sinDec, Math.sqrt(1 - sinDec * sinDec)) * RAD;

    let eot = L0 - RA;
    if (eot > 180) eot -= 360;
    if (eot < -180) eot += 360;
    eot = eot * 4;

    const cosHA =
      (Math.sin(-0.833 * DEG) - Math.sin(lat * DEG) * Math.sin(Dec * DEG)) /
      (Math.cos(lat * DEG) * Math.cos(Dec * DEG));
    const HA = Math.acos(Math.max(-1, Math.min(1, cosHA))) * RAD;

    // Mediodia solar en hora local
    let noon = 12 - lon / 15 - eot / 60 + utcOffset / 60;
    noon = ((noon % 24) + 24) % 24;

    let sunrise = noon - HA / 15;
    let sunset = noon + HA / 15;
    sunrise = (sunrise + 24) % 24;
    sunset = (sunset + 24) % 24;

    const fmt = (h) => {
      const hr = Math.floor(h);
      const mn = Math.floor((h - hr) * 60);
      return `${String(hr).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
    };

    return { sunrise: fmt(sunrise), sunset: fmt(sunset), solarNoon: fmt(noon) };
  }

  return { getPosition, getTimes };
})();
