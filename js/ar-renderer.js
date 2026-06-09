/**
 * ARRenderer.js - Renderiza la posicion del sol sobre la camara
 * Gestiona el overlay AR, flechas de direccion y circulo solar
 */

const ARRenderer = (() => {
  const $ = (id) => document.getElementById(id);
  const sunOverlay = $("sun-overlay");
  const sunCircle = $("sun-circle");
  const sunLabel = $("sun-label");
  const searchIndicator = $("search-indicator");
  const searchText = $("search-text");
  const arrowUp = $("arrow-up");
  const arrowDown = $("arrow-down");
  const arrowLeft = $("arrow-left");
  const arrowRight = $("arrow-right");
  const compassNeedle = $("compass-needle");
  const horizonIndicator = $("horizon-indicator");
  const horizonArrow = $("horizon-arrow");
  const horizonLabel = $("horizon-label");

  let _cam = {
    vFOV: 50,
    hFOV: 65,
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let _sunAzimuth = 0;
  let _sunAltitude = 0;
  let _deviceHeading = 0;
  let _deviceBeta = 0;

  const DEG = Math.PI / 180;

  function calibrateCamera() {
    _cam.width = window.innerWidth;
    _cam.height = window.innerHeight;
    const aspect = _cam.width / _cam.height;
    _cam.vFOV = 50;
    _cam.hFOV =
      2 * Math.atan(aspect * Math.tan((_cam.vFOV * DEG) / 2)) * (180 / Math.PI);
  }

  function update(sunAzimuth, sunAltitude, deviceHeading, deviceBeta) {
    _sunAzimuth = sunAzimuth;
    _sunAltitude = sunAltitude;
    _deviceHeading = deviceHeading;
    _deviceBeta = deviceBeta || 0;
    render();
  }

  function render() {
    calibrateCamera();

    // 1. Proyectar sol a pantalla
    const { x, y, onScreen } = projectSunToScreen();
    const sobreHorizonte = _sunAltitude > -0.5;

    // DEBUG: console log cada 30 frames para ver valores
    if (Math.random() < 0.02) {
      console.log(
        "AR render:",
        "sunAz=",
        _sunAzimuth.toFixed(0),
        "sunAlt=",
        _sunAltitude.toFixed(1),
        "devHead=",
        _deviceHeading.toFixed(0),
        "devBeta=",
        _deviceBeta.toFixed(1),
        "onScreen=",
        onScreen,
        "x=",
        Math.round(x),
        "y=",
        Math.round(y),
      );
    }

    // 2. Circulo del sol (solo si esta sobre horizonte y en pantalla)
    const showSun = onScreen && sobreHorizonte;
    if (showSun) {
      sunOverlay.classList.remove("hidden");
      sunOverlay.style.left = x + "px";
      sunOverlay.style.top = y + "px";
      const scale = Math.max(0.4, Math.min(1, (_sunAltitude + 10) / 90));
      sunCircle.style.transform = `scale(${scale})`;

      // Mostrar info detallada: altitud relativa y azimuth relativo
      const azDiff =
        ((((_sunAzimuth - _deviceHeading) % 360) + 540) % 360) - 180;
      const relAlt = _sunAltitude - _deviceBeta;
      sunLabel.innerHTML =
        `${Math.round(_sunAltitude)}° alt | ${Math.round(_sunAzimuth)}° az` +
        `<br><span style="font-size:10px;opacity:0.6">` +
        `rel: ${azDiff > 0 ? "+" : ""}${Math.round(azDiff)}° h, ${relAlt > 0 ? "+" : ""}${Math.round(relAlt)}° v` +
        `</span>`;
    } else {
      sunOverlay.classList.add("hidden");
    }

    // 3. Indicador de direccion (flecha en el horizonte/borde)
    //    Aparece cuando el sol no es visible: bajo horizonte, muy alto, o fuera de pantalla
    if (!showSun) {
      const horX = projectSunToHorizon();
      if (horX !== null) {
        horizonIndicator.classList.remove("hidden");
        horizonIndicator.style.left = horX + "px";

        if (sobreHorizonte) {
          // Sol sobre horizonte pero fuera de pantalla: flecha arriba
          horizonIndicator.style.top = _cam.height / 2 - 14 + "px";
          horizonArrow.textContent = "▲";
          horizonLabel.textContent = "Sol (" + Math.round(_sunAltitude) + "°)";
        } else {
          // Sol bajo horizonte: flecha abajo
          horizonIndicator.style.top = _cam.height / 2 - 14 + "px";
          horizonArrow.textContent = "▼";
          horizonLabel.textContent =
            "Sol " + Math.round(Math.abs(_sunAltitude)) + "° abajo";
        }
      } else {
        horizonIndicator.classList.add("hidden");
      }
    } else {
      horizonIndicator.classList.add("hidden");
    }

    // 4. Flechas direccionales centrales
    const needsArrows = !showSun;
    if (needsArrows) {
      searchIndicator.classList.remove("hidden");
      const dir = getDirectionFromDevice();
      showArrows(dir);
      searchText.textContent = buildSearchText(sobreHorizonte, onScreen);
    } else {
      searchIndicator.classList.add("hidden");
    }

    // 5. Brujula
    compassNeedle.style.transform = `rotate(${-_deviceHeading}deg)`;
  }

  /**
   * Proyecta la direccion del sol sobre la linea de horizonte
   * Devuelve la coordenada X en pantalla, o null si esta detras
   */
  function projectSunToHorizon() {
    const azDiff = ((((_sunAzimuth - _deviceHeading) % 360) + 540) % 360) - 180;

    // Si el sol esta detras (> 100° cualquier lado), no mostrar indicador
    if (Math.abs(azDiff) > 100) return null;

    const xRatio = azDiff / _cam.hFOV;
    let x = _cam.width / 2 + xRatio * _cam.width;
    x = Math.max(10, Math.min(_cam.width - 10, x));
    return x;
  }

  function buildSearchText(sobreHorizonte, onScreen) {
    if (!sobreHorizonte) {
      return `Sol ${Math.round(Math.abs(_sunAltitude))}° bajo el horizonte. Sigue las flechas.`;
    }
    if (sobreHorizonte && !onScreen) {
      return `Gira el movil siguiendo las flechas para ver el sol`;
    }
    return `Mueve el dispositivo para encontrar el sol`;
  }

  function projectSunToScreen() {
    const azDiff = ((((_sunAzimuth - _deviceHeading) % 360) + 540) % 360) - 180;
    const relAlt = _sunAltitude - _deviceBeta;

    const xRatio = azDiff / _cam.hFOV;
    const yRatio = relAlt / (_cam.vFOV / 2);

    let x = _cam.width / 2 + xRatio * _cam.width;
    let y = _cam.height / 2 - yRatio * _cam.height;

    const margin = 100;
    const onScreen =
      x >= -margin &&
      x <= _cam.width + margin &&
      y >= -margin &&
      y <= _cam.height + margin;

    x = Math.max(-margin, Math.min(_cam.width + margin, x));
    y = Math.max(-margin, Math.min(_cam.height + margin, y));

    return { x, y, onScreen };
  }

  function getDirectionFromDevice() {
    const azDiff = ((((_sunAzimuth - _deviceHeading) % 360) + 540) % 360) - 180;
    const altDiff = _sunAltitude - _deviceBeta;
    const threshold = 10;

    return {
      up: altDiff > threshold,
      down: altDiff < -threshold,
      left: azDiff < -threshold,
      right: azDiff > threshold,
    };
  }

  function showArrows(dir) {
    arrowUp.classList.toggle("hidden", !dir.up);
    arrowDown.classList.toggle("hidden", !dir.down);
    arrowLeft.classList.toggle("hidden", !dir.left);
    arrowRight.classList.toggle("hidden", !dir.right);
    arrowUp.classList.toggle("visible", dir.up);
    arrowDown.classList.toggle("visible", dir.down);
    arrowLeft.classList.toggle("visible", dir.left);
    arrowRight.classList.toggle("visible", dir.right);
  }

  function reset() {
    sunOverlay.classList.add("hidden");
    searchIndicator.classList.add("hidden");
    horizonIndicator.classList.add("hidden");
  }

  calibrateCamera();
  window.addEventListener("resize", calibrateCamera);

  return { update, reset };
})();
