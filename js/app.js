/**
 * app.js - Aplicacion principal SunPos AR
 * Orquesta camara, sensores, calculo solar y renderizado AR
 * Soporta modo prueba sin camara con controles tactiles
 */

const App = (() => {
  const $ = (id) => document.getElementById(id);
  const cameraFeed = $("camera-feed");
  const dateInput = $("date-input");
  const timeInput = $("time-input");
  const latInput = $("lat-input");
  const lonInput = $("lon-input");
  const locationMethod = $("location-method");
  const manualCoords = $("manual-coords");
  const locationInfo = $("location-info");
  const sunInfo = $("sun-info");
  const deviceOrient = $("device-orientation");
  const sensorStatus = $("sensor-status");
  const btnLocate = $("btn-locate");
  const btnFollow = $("btn-follow");
  const btnStart = $("btn-start");
  const btnDemo = $("btn-demo");
  const permissionOverlay = $("permission-overlay");
  const controlPanel = $("control-panel");
  const panelHandle = $("panel-handle");
  const gridBg = $("grid-bg");
  const horizonLine = $("horizon-line");

  let _state = {
    latitude: 40.4168,
    longitude: -3.7038,
    followMode: false,
    locateMode: false,
    stream: null,
    cameraReady: false,
    animFrameId: null,
    sensorsStarted: false,
    demoRelAltOffset: 0,
    isDemoMode: false,
    locationSource: "fallback",
    // Orientacion simulada para modo demo
    demoHeading: 0, // 0-360, hacia donde apunta el dispositivo
    demoDragging: null, // null, 'azimuth', 'elevation'
  };

  function init() {
    // Registrar Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("sw.js")
        .then(() => console.log("SW registrado"))
        .catch((err) => console.warn("SW error:", err));
    }

    const now = new Date();
    dateInput.value = now.toISOString().split("T")[0];
    timeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Precargar coordenadas manuales con Madrid
    latInput.value = "40.4168";
    lonInput.value = "-3.7038";

    // Eventos UI
    locationMethod.addEventListener("change", () => {
      manualCoords.classList.toggle(
        "hidden",
        locationMethod.value !== "manual",
      );
    });

    panelHandle.addEventListener("click", () => {
      controlPanel.classList.toggle("open");
    });

    btnStart.addEventListener("click", startWithCamera);
    btnDemo.addEventListener("click", startDemo);
    btnLocate.addEventListener("click", locateSun);
    btnFollow.addEventListener("click", toggleFollow);

    loadSavedLocation();

    // Mostrar overlay de inicio
    permissionOverlay.classList.remove("hidden");

    // Arrancar game loop
    gameLoop();
  }

  // ===== INICIO CON CAMARA =====
  async function startWithCamera() {
    btnStart.disabled = true;
    btnStart.textContent = "Iniciando...";
    btnDemo.disabled = true;

    // 1. Sensores orientacion. En iOS el permiso debe pedirse desde este gesto.
    Sensors.start();
    _state.sensorsStarted = true;
    Sensors.on("location", onLocationUpdate);
    Sensors.on("orientation", onOrientationUpdate);
    const orientationGranted = await Sensors.requestPermission();

    // 2. GPS
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          _state.latitude = pos.coords.latitude;
          _state.longitude = pos.coords.longitude;
          saveLocation(pos.coords.latitude, pos.coords.longitude, "GPS");
          locationInfo.textContent =
            `Ubicacion: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}` +
            (pos.coords.accuracy
              ? ` (±${Math.round(pos.coords.accuracy)}m)`
              : "");
          sensorStatus.textContent = "GPS OK";
        },
        (err) => {
          console.warn("GPS error:", err.message);
          fallbackLocation();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
      );
    } else {
      fallbackLocation();
    }

    // 3. Camara
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      cameraFeed.srcObject = stream;
      try {
        await cameraFeed.play();
      } catch (e) {
        /* ok */
      }
      _state.stream = stream;
      _state.cameraReady = true;
      console.log("Camera OK");
    } catch (camErr) {
      console.error("Camera error:", camErr.name, camErr.message);
      let msg = "Error de camara:\n\n" + camErr.name + ": " + camErr.message;
      if (camErr.name === "NotAllowedError") {
        msg += "\n\nAcepta el permiso de camara en el navegador.";
      }
      alert(msg);
    }

    // 4. Sensores orientacion
    // Ya se arrancaron al inicio para respetar el gesto de usuario en iOS.

    // 5. UI final
    permissionOverlay.classList.add("hidden");
    controlPanel.classList.add("open");
    sensorStatus.textContent =
      (_state.cameraReady ? "Camara OK | " : "Camara NO | ") +
      (orientationGranted ? "Sensores OK" : "Sensores sin permiso");

    btnStart.disabled = false;
    btnStart.textContent = "Comenzar con camara";
  }

  // ===== OBTENER UBICACION =====

  /**
   * Obtiene ubicacion: intenta GPS, luego IP, luego Madrid como fallback
   * @param {function} callback - funcion a llamar con (lat, lon, fuente)
   */
  function obtenerUbicacion(callback) {
    if ("geolocation" in navigator) {
      locationInfo.textContent = "Buscando GPS... (permite la ubicacion)";
      sensorStatus.textContent = "Esperando GPS...";

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          _state.latitude = lat;
          _state.longitude = lon;
          saveLocation(lat, lon, "GPS");
          const precision = pos.coords.accuracy
            ? ` ±${Math.round(pos.coords.accuracy)}m`
            : "";
          locationInfo.textContent = `Ubicacion: ${lat.toFixed(4)}, ${lon.toFixed(4)} (GPS${precision})`;
          sensorStatus.textContent = "GPS OK";
          if (callback) callback(lat, lon, "GPS");
        },
        (err) => {
          console.warn("GPS error:", err.code, err.message);
          let msg = "";
          switch (err.code) {
            case err.PERMISSION_DENIED:
              msg =
                "Permiso de ubicacion denegado. Permitelo en el navegador o usa coordenadas manuales.";
              break;
            case err.POSITION_UNAVAILABLE:
              msg = "GPS no disponible. " + err.message;
              break;
            case err.TIMEOUT:
              msg = "GPS tardando mucho. Probando ubicacion por IP...";
              break;
          }
          locationInfo.textContent = msg;
          obtenerUbicacionPorIP(callback);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    } else {
      locationInfo.textContent =
        "Este dispositivo no tiene GPS. Probando ubicacion por IP...";
      obtenerUbicacionPorIP(callback);
    }
  }

  /**
   * Obtiene ubicacion aproximada por IP
   */
  function obtenerUbicacionPorIP(callback) {
    // Probar varios APIs de geolocalizacion por IP
    const apis = [
      "https://ip-api.com/json/?fields=lat,lon,city,country",
      "https://ipapi.co/json/",
    ];

    function probarAPI(index) {
      if (index >= apis.length) {
        fallbackMadrid(callback);
        return;
      }

      fetch(apis[index], { mode: "cors" })
        .then((res) => res.json())
        .then((data) => {
          let lat, lon, ciudad;
          if (data.lat !== undefined && data.lon !== undefined) {
            // ip-api.com
            lat = data.lat;
            lon = data.lon;
            ciudad = data.city || "";
          } else if (
            data.latitude !== undefined &&
            data.longitude !== undefined
          ) {
            // ipapi.co
            lat = data.latitude;
            lon = data.longitude;
            ciudad = data.city || "";
          } else {
            throw new Error("No coordinates in response");
          }

          _state.latitude = lat;
          _state.longitude = lon;
          saveLocation(lat, lon, "IP");
          locationInfo.textContent = `Ubicacion estimada: ${lat.toFixed(4)}, ${lon.toFixed(4)}${ciudad ? " (" + ciudad + ")" : ""}`;
          sensorStatus.textContent = "Ubicacion por IP";
          if (callback) callback(lat, lon, "IP");
        })
        .catch(() => {
          probarAPI(index + 1);
        });
    }

    probarAPI(0);
  }

  function fallbackMadrid(callback) {
    const lat = 40.4168;
    const lon = -3.7038;
    _state.latitude = lat;
    _state.longitude = lon;
    _state.locationSource = "fallback";
    locationInfo.textContent =
      "No se pudo obtener ubicacion. Usando Madrid como referencia. Cambia a coordenadas manuales.";
    sensorStatus.textContent = "Ubicacion: Madrid (fallback)";
    if (callback) callback(lat, lon, "fallback");
  }

  // ===== MODO DEMO SIN CAMARA =====
  function startDemo() {
    _state.isDemoMode = true;

    gridBg.classList.add("visible");
    cameraFeed.style.display = "none";

    Sensors.start();
    _state.sensorsStarted = true;
    Sensors.on("location", onLocationUpdate);
    Sensors.on("orientation", onOrientationUpdate);

    permissionOverlay.classList.add("hidden");
    controlPanel.classList.add("open");

    // Crear los sliders (aun sin posicionar)
    createTouchControls();

    // Obtener ubicacion real y calcular sol
    obtenerUbicacion((lat, lon, fuente) => {
      const now = new Date();
      dateInput.value = now.toISOString().split("T")[0];
      timeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      const pos = SunCalc.getPosition(now, lat, lon);
      const times = SunCalc.getTimes(now, lat, lon);
      _state._targetSunPos = pos;
      _state._targetDate = now;

      const dirStr = azimuthToText(pos.azimuth);
      sunInfo.textContent = `Sol AHORA: ${pos.altitude.toFixed(1)}° alt, ${pos.azimuth.toFixed(1)}° (${dirStr}) | ${times.sunrise}-${times.sunset}`;

      _state.demoHeading = pos.azimuth;
      _state.demoRelAltOffset = 0; // sol centrado verticalmente
      _state.demoHeading = pos.azimuth;
      sensorStatus.textContent = `Ubicacion: ${fuente} - Modo demo`;
      console.log("Demo: sol =", pos.altitude, pos.azimuth);
    });
  }

  function createTouchControls() {
    const container = document.getElementById("camera-container");

    // Crear control táctil si no existe
    let tc = document.getElementById("touch-control");
    if (tc) {
      tc.classList.add("visible");
      return;
    }

    tc = document.createElement("div");
    tc.id = "touch-control";
    tc.className = "visible";
    tc.innerHTML = `
      <label>Giro horizontal (← izq  /  der →)</label>
      <div id="slider-azimuth" class="touch-slider">
        <div class="thumb" style="left: calc(50% - 12px)"></div>
      </div>
      <label>Sol en pantalla (▼ abajo  /  ▲ arriba)</label>
      <div id="slider-elevation" class="touch-slider">
        <div class="thumb" style="left: calc(50% - 12px)"></div>
      </div>
      <div id="touch-value">0°</div>
    `;
    container.appendChild(tc);

    // Texto explicativo sobre los sliders
    const helpText = document.createElement("p");
    helpText.id = "slider-help";
    helpText.style.cssText =
      "font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px";
    helpText.textContent =
      "Mueve los sliders. El sol centrado = lo estas apuntando.";
    tc.appendChild(helpText);

    // Slider azimuth
    setupSlider("slider-azimuth", (ratio) => {
      _state.demoHeading = ratio * 360;
      updateTouchDisplay();
    });

    // Slider elevacion: offset vertical (-60 a +60), centro = sol visible
    setupSlider("slider-elevation", (ratio) => {
      _state.demoRelAltOffset = 60 - ratio * 120;
      updateTouchDisplay();
    });
  }

  function setupSlider(sliderId, onChange) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    const thumb = slider.querySelector(".thumb");

    function getRatio(clientX) {
      const rect = slider.getBoundingClientRect();
      let ratio = (clientX - rect.left) / rect.width;
      ratio = Math.max(0, Math.min(1, ratio));
      return ratio;
    }

    function onStart(clientX) {
      const ratio = getRatio(clientX);
      if (thumb) thumb.style.left = `calc(${ratio * 100}% - 12px)`;
      onChange(ratio);
    }

    function onMove(clientX) {
      const ratio = getRatio(clientX);
      if (thumb) thumb.style.left = `calc(${ratio * 100}% - 12px)`;
      onChange(ratio);
    }

    // Mouse
    slider.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onStart(e.clientX);
      const onMouseMove = (ev) => {
        ev.preventDefault();
        onMove(ev.clientX);
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp, { once: true });
    });

    // Touch
    slider.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        onStart(touch.clientX);
      },
      { passive: false },
    );

    slider.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        onMove(touch.clientX);
      },
      { passive: false },
    );

    slider.addEventListener("touchend", (e) => {
      // No hacer nada, la posicion se mantiene
    });
  }

  function updateTouchDisplay() {
    const el = document.getElementById("touch-value");
    if (el) {
      el.textContent = `Az:${Math.round(_state.demoHeading)}° Off:${Math.round(_state.demoRelAltOffset || 0)}°`;
    }
    deviceOrient.textContent = `Azimuth: ${Math.round(_state.demoHeading)}° | OffsetV:${Math.round(_state.demoRelAltOffset || 0)}°`;

    // Actualizar etiqueta del slider de elevacion para mostrar el rango real
    const elLabel = document.querySelector("#touch-control label:nth-child(3)");
    if (elLabel) {
      elLabel.textContent = `Sol en pantalla (offset: ${Math.round(_state.demoRelAltOffset || 0)}°)`;
    }
  }

  // ===== UBICACION =====
  function fallbackLocation() {
    locationInfo.textContent =
      "Usando ubicacion por defecto (Madrid). Introduce coordenadas manuales o activa GPS.";
    _state.latitude = 40.4168;
    _state.longitude = -3.7038;
    _state.locationSource = "fallback";
  }

  // ===== LOCALIZAR SOL =====
  function locateSun() {
    _state.locateMode = true;
    _state.followMode = false;
    btnFollow.classList.remove("active");
    btnLocate.disabled = true;
    btnLocate.textContent = "Obteniendo ubicacion...";

    const dateStr = dateInput.value;
    const timeStr = timeInput.value;
    if (!dateStr || !timeStr) {
      alert("Selecciona fecha y hora");
      btnLocate.disabled = false;
      btnLocate.textContent = "🔍 Localizar Sol";
      return;
    }

    const [year, month, day] = dateStr.split("-").map(Number);
    const [hour, minute] = timeStr.split(":").map(Number);
    const targetDate = new Date(year, month - 1, day, hour, minute);

    if (isNaN(targetDate.getTime())) {
      alert("Fecha u hora invalida");
      btnLocate.disabled = false;
      btnLocate.textContent = "🔍 Localizar Sol";
      return;
    }

    // Funcion interna que realiza el calculo con las coordenadas ya resueltas
    const calcular = (lat, lon, fuente) => {
      _state.latitude = lat;
      _state.longitude = lon;
      saveLocation(lat, lon, fuente);

      const pos = SunCalc.getPosition(targetDate, lat, lon);
      const times = SunCalc.getTimes(targetDate, lat, lon);

      const dirStr = azimuthToText(pos.azimuth);
      sunInfo.textContent = `Sol: ${pos.altitude.toFixed(1)}° alt, ${pos.azimuth.toFixed(1)}° (${dirStr})`;
      locationInfo.textContent = `Ubicacion: ${lat.toFixed(4)}, ${lon.toFixed(4)} (${fuente}) | Sol: ${times.sunrise}-${times.sunset}`;

      // En modo demo, actualizar los sliders
      if (_state.isDemoMode) {
        _state.demoHeading = pos.azimuth;
        _state.demoRelAltOffset = 0;

        const azRatio = _state.demoHeading / 360;
        const elMid = 0.5; // centro
        const azThumb = document.querySelector("#slider-azimuth .thumb");
        const elThumb = document.querySelector("#slider-elevation .thumb");
        if (azThumb) azThumb.style.left = `calc(${azRatio * 100}% - 12px)`;
        if (elThumb) elThumb.style.left = `calc(${50}% - 12px)`;
        updateTouchDisplay();
      }

      btnLocate.disabled = false;
      btnLocate.textContent = "🔍 Localizar Sol";

      _state._targetSunPos = pos;
      _state._targetDate = targetDate;
    };

    // Resolver coordenadas
    if (locationMethod.value === "manual") {
      let lat = parseFloat(latInput.value);
      let lon = parseFloat(lonInput.value);
      if (
        isNaN(lat) ||
        isNaN(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        alert("Coordenadas invalidas. Latitud: -90 a 90, Longitud: -180 a 180");
        btnLocate.disabled = false;
        btnLocate.textContent = "🔍 Localizar Sol";
        return;
      }
      calcular(lat, lon, "manual");
    } else {
      // Modo GPS: intentar obtener ubicacion fresca
      btnLocate.textContent = "Esperando GPS...";

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            calcular(pos.coords.latitude, pos.coords.longitude, "GPS");
          },
          (err) => {
            // GPS falla: usar ultima conocida
            console.warn("GPS error en locateSun:", err.message);
            const lat = _state.latitude;
            const lon = _state.longitude;
            if (lat && lon) {
              calcular(lat, lon, "ultima conocida");
            } else {
              alert(
                "No hay ubicacion disponible. Activa el GPS o usa coordenadas manuales.",
              );
              btnLocate.disabled = false;
              btnLocate.textContent = "🔍 Localizar Sol";
            }
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
        );
      } else {
        const lat = _state.latitude;
        const lon = _state.longitude;
        if (lat && lon) {
          calcular(lat, lon, "ultima conocida");
        } else {
          alert(
            "GPS no disponible en este dispositivo. Usa coordenadas manuales.",
          );
          btnLocate.disabled = false;
          btnLocate.textContent = "🔍 Localizar Sol";
        }
      }
    }
  }

  function toggleFollow() {
    _state.followMode = !_state.followMode;
    btnFollow.classList.toggle("active", _state.followMode);

    if (_state.followMode) {
      btnFollow.textContent = "⏹ Detener";
      sunInfo.textContent = "Siguiendo el sol en tiempo real...";
    } else {
      btnFollow.textContent = "🎯 Seguir tiempo real";
      sunInfo.textContent = "Seguimiento detenido";
    }
  }

  function onLocationUpdate(state) {
    if (state.latitude !== null && state.longitude !== null) {
      _state.latitude = state.latitude;
      _state.longitude = state.longitude;
      saveLocation(state.latitude, state.longitude, "GPS");
      locationInfo.textContent =
        `Ubicacion: ${state.latitude.toFixed(4)}, ${state.longitude.toFixed(4)}` +
        (state.accuracy ? ` (±${Math.round(state.accuracy)}m)` : "");
    }
  }

  function onOrientationUpdate(state) {
    if (_state.isDemoMode) return;

    const camBeta = state.beta - 90;
    deviceOrient.textContent =
      `Sensor: ${Math.round(state.alpha)}° a, ${Math.round(state.beta)}° b | Cam elev: ${Math.round(camBeta)}°`;
    sensorStatus.textContent =
      (_state.cameraReady ? "Camara OK | " : "Camara NO | ") + "Sensores OK";
  }

  function gameLoop() {
    let heading, beta;

    if (_state.isDemoMode) {
      // Modo demo: simulacion
      heading = _state.demoHeading;
      beta = (_state._targetSunPos ? _state._targetSunPos.altitude : 0) + (_state.demoRelAltOffset || 0);
    } else {
      // Sensores reales: convertir sensor.beta (0=tumbado, 90=vertical) a elevacion camara
      const sensorState = Sensors.getState();
      heading = Sensors.getTrueHeading();
      // sensor.beta=90° -> camara al horizonte (0°). sensor.beta=0° -> camara al suelo (-90°)
      beta = sensorState.beta - 90;
    }

    let pos;

    if (_state.followMode) {
      const targetDate = new Date();
      let lat = _state.latitude || 40.4168;
      let lon = _state.longitude || -3.7038;

      pos = SunCalc.getPosition(targetDate, lat, lon);
      _state._targetSunPos = pos;

      const times = SunCalc.getTimes(targetDate, lat, lon);
      const dirStr = azimuthToText(pos.azimuth);
      sunInfo.textContent =
        `Sol ahora: ${pos.altitude.toFixed(1)}° alt, ${pos.azimuth.toFixed(1)}° (${dirStr})` +
        ` | ${times.sunrise}-${times.sunset}`;
    } else if (_state._targetSunPos) {
      pos = _state._targetSunPos;
    } else {
      pos = { azimuth: 0, altitude: -10 };
    }

    ARRenderer.update(pos.azimuth, pos.altitude, heading, beta);

    _state.animFrameId = requestAnimationFrame(gameLoop);
  }

  function loadSavedLocation() {
    try {
      const saved = JSON.parse(localStorage.getItem("sunpos.location") || "null");
      if (!saved || typeof saved.lat !== "number" || typeof saved.lon !== "number") {
        return;
      }
      _state.latitude = saved.lat;
      _state.longitude = saved.lon;
      _state.locationSource = saved.source || "guardada";
      latInput.value = String(saved.lat);
      lonInput.value = String(saved.lon);
      locationInfo.textContent = `Ultima ubicacion: ${saved.lat.toFixed(4)}, ${saved.lon.toFixed(4)} (${_state.locationSource})`;
    } catch (e) {
      console.warn("No se pudo leer la ubicacion guardada:", e);
    }
  }

  function saveLocation(lat, lon, source) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    _state.locationSource = source;
    if (source === "fallback") return;
    try {
      localStorage.setItem(
        "sunpos.location",
        JSON.stringify({ lat, lon, source, savedAt: Date.now() }),
      );
    } catch (e) {
      console.warn("No se pudo guardar la ubicacion:", e);
    }
  }

  function azimuthToText(az) {
    const dirs = [
      "N",
      "NNE",
      "NE",
      "ENE",
      "E",
      "ESE",
      "SE",
      "SSE",
      "S",
      "SSW",
      "SW",
      "WSW",
      "W",
      "WNW",
      "NW",
      "NNW",
    ];
    return dirs[Math.round(az / 22.5) % 16];
  }

  function stop() {
    if (_state.stream) {
      _state.stream.getTracks().forEach((t) => t.stop());
    }
    if (_state.animFrameId) {
      cancelAnimationFrame(_state.animFrameId);
    }
    if (_state.sensorsStarted) {
      Sensors.stop();
    }
    ARRenderer.reset();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("beforeunload", stop);

  return { init, stop, locateSun, toggleFollow };
})();
