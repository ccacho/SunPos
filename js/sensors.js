/**
 * Sensors.js - Gestion de sensores del dispositivo
 * Orientacion, brujula, geolocalizacion
 */

const Sensors = (() => {
  let _listeners = { orientation: [], location: [], compass: [] };

  let _state = {
    alpha: 0,
    beta: 0,
    gamma: 0,
    heading: 0,
    stableHeading: 0,
    stableBeta: 0,
    stableGamma: 0,
    jitter: 0,
    latitude: null,
    longitude: null,
    accuracy: null,
    compassAccuracy: null,
    isAbsolute: false,
  };

  let _watchId = null;
  let _orientHandler = null;
  let _orientationListening = false;
  let _started = false;

  /**
   * Manejador unico de deviceorientation
   */
  function _makeHandler() {
    return (e) => {
      if (!e) return;

      _state.alpha = e.alpha || 0;
      _state.beta = e.beta || 0;
      _state.gamma = e.gamma || 0;

      // iOS: webkitCompassHeading da el heading absoluto (norte verdadero)
      if (e.webkitCompassHeading !== undefined) {
        _state.heading = e.webkitCompassHeading;
        _state.isAbsolute = true;
      } else if (e.absolute === true) {
        _state.heading = e.alpha;
        _state.isAbsolute = true;
      } else {
        _state.heading = e.alpha;
        _state.isAbsolute = false;
      }

      _updateStabilizedOrientation();
      _notify("orientation");
      _notify("compass");
    };
  }

  function _angleDiff(target, current) {
    return ((((target - current) % 360) + 540) % 360) - 180;
  }

  function _smoothAngle(current, target, alpha) {
    return (current + _angleDiff(target, current) * alpha + 360) % 360;
  }

  function _smoothValue(current, target, alpha) {
    return current + (target - current) * alpha;
  }

  function _getRawTrueHeading() {
    if (_state.latitude === null || _state.longitude === null) {
      return _state.heading;
    }
    if (_state.isAbsolute) {
      return _state.heading;
    }
    const decl = _getMagneticDeclination(
      _state.latitude,
      _state.longitude,
      new Date().getFullYear(),
    );
    return (_state.heading + decl + 360) % 360;
  }

  function _updateStabilizedOrientation() {
    const rawHeading = _getRawTrueHeading();
    const rawBeta = _state.beta;
    const rawGamma = _state.gamma;

    if (!_state._stableReady) {
      _state.stableHeading = rawHeading;
      _state.stableBeta = rawBeta;
      _state.stableGamma = rawGamma;
      _state.jitter = 0;
      _state._stableReady = true;
      return;
    }

    const headingDelta = Math.abs(_angleDiff(rawHeading, _state.stableHeading));
    const betaDelta = Math.abs(rawBeta - _state.stableBeta);
    const gammaDelta = Math.abs(rawGamma - _state.stableGamma);
    const motion = Math.max(headingDelta, betaDelta, gammaDelta);

    const alpha = motion > 18 ? 0.34 : motion > 7 ? 0.16 : 0.035;
    const deadband = motion > 7 ? 0.05 : 0.75;

    if (headingDelta > deadband) {
      _state.stableHeading = _smoothAngle(_state.stableHeading, rawHeading, alpha);
    }
    if (betaDelta > deadband) {
      _state.stableBeta = _smoothValue(_state.stableBeta, rawBeta, alpha);
    }
    if (gammaDelta > deadband) {
      _state.stableGamma = _smoothValue(_state.stableGamma, rawGamma, alpha);
    }

    _state.jitter = _smoothValue(_state.jitter, motion, 0.08);
  }

  function start() {
    if (_started) return this;
    _started = true;

    // GPS
    if ("geolocation" in navigator) {
      _watchId = navigator.geolocation.watchPosition(
        (pos) => {
          _state.latitude = pos.coords.latitude;
          _state.longitude = pos.coords.longitude;
          _state.accuracy = pos.coords.accuracy;
          _notify("location");
        },
        (err) => console.warn("GPS error:", err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
    }

    // DeviceOrientation
    if ("DeviceOrientationEvent" in window) {
      if (!_orientHandler) {
        _orientHandler = _makeHandler();
      }

      // iOS 13+ requiere permiso explicito - se llama desde app.js antes
      if (typeof DeviceOrientationEvent.requestPermission !== "function") {
        window.addEventListener("deviceorientation", _orientHandler);
        _orientationListening = true;
      }

      // Android: deviceorientationabsolute cuando esta disponible
      window.addEventListener("deviceorientationabsolute", _orientHandler);
    }

    return this;
  }

  /**
   * iOS 13+ - llama esto DESPUES de que el usuario haya hecho click
   */
  async function requestPermission() {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result === "granted") {
          // Crear handler si no existe
          if (!_orientHandler) {
            _orientHandler = _makeHandler();
          }
          if (!_orientationListening) {
            window.addEventListener("deviceorientation", _orientHandler);
            _orientationListening = true;
          }
          return true;
        }
        console.warn("DeviceOrientation permission denied");
        return false;
      } catch (e) {
        console.warn("DeviceOrientation permission error:", e);
        return false;
      }
    }
    return true;
  }

  /**
   * Declinacion magnetica usando modelo simplificado
   * Basado en WMM (World Magnetic Model)
   */
  function _getMagneticDeclination(lat, lon, year) {
    // Coeficientes simplificados del WMM 2025
    // g10, g11, h11 principales
    const g10 = -29404.5;
    const g11 = -1450.7;
    const h11 = 4652.9;

    // Variacion secular anual
    const g10d = 6.7;
    const g11d = -7.7;
    const h11d = -14.1;

    const t = (year - 2025.0) / 1.0;
    const g10t = g10 + g10d * t;
    const g11t = g11 + g11d * t;
    const h11t = h11 + h11d * t;

    const phi = (lat * Math.PI) / 180;
    const lam = (lon * Math.PI) / 180;
    const sphi = Math.sin(phi);
    const cphi = Math.cos(phi);

    // Componentes del campo (solo termino dipolar)
    const X = -(
      g10t * sphi +
      (g11t * cphi * Math.cos(lam) + h11t * cphi * Math.sin(lam))
    );
    const Y = g11t * Math.sin(lam) - h11t * Math.cos(lam);
    const decl = (Math.atan2(Y, -X) * 180) / Math.PI;

    return decl;
  }

  function getTrueHeading() {
    return _getRawTrueHeading();
  }

  function getStableHeading() {
    return _state._stableReady ? _state.stableHeading : getTrueHeading();
  }

  function getStableState() {
    return {
      ..._state,
      heading: getStableHeading(),
      beta: _state._stableReady ? _state.stableBeta : _state.beta,
      gamma: _state._stableReady ? _state.stableGamma : _state.gamma,
      rawHeading: getTrueHeading(),
      rawBeta: _state.beta,
      rawGamma: _state.gamma,
    };
  }

  function _notify(type) {
    _listeners[type].forEach((fn) => fn({ ..._state }));
  }

  function on(type, fn) {
    if (_listeners[type]) _listeners[type].push(fn);
    return this;
  }

  function off(type, fn) {
    if (_listeners[type])
      _listeners[type] = _listeners[type].filter((f) => f !== fn);
    return this;
  }

  function getState() {
    return { ..._state };
  }

  function stop() {
    _started = false;
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }
    if (_orientHandler) {
      window.removeEventListener("deviceorientation", _orientHandler);
      window.removeEventListener("deviceorientationabsolute", _orientHandler);
    }
    _orientationListening = false;
    _listeners = { orientation: [], location: [], compass: [] };
    return this;
  }

  return {
    start,
    stop,
    on,
    off,
    getState,
    getStableState,
    getTrueHeading,
    getStableHeading,
    requestPermission,
  };
})();
