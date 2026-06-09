/**
 * ARRenderer.js - Renderiza la posicion del sol sobre la camara
 * El circulo del sol es visible SIEMPRE (con opacidad reducida si esta fuera)
 * Las flechas guian hasta centrarlo
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

    // Proyeccion del sol a coordenadas de pantalla
    const { x, y, onScreen, azDiff, relAlt } = projectSunToScreen();
    const sobreHorizonte = _sunAltitude > -0.5;

    // ===== 1. CIRCULO DEL SOL: siempre visible si sobre horizonte =====
    // Si esta fuera de pantalla, se muestra en el borde mas cercano
    // con opacidad reducida y una flecha indicadora
    if (sobreHorizonte) {
      sunOverlay.classList.remove("hidden");
      sunOverlay.style.left = x + "px";
      sunOverlay.style.top = y + "px";

      // Escala y opacidad segun distancia al centro
      const distHor = Math.abs(azDiff);
      const distVer = Math.abs(relAlt);
      const distMax = Math.max(
        distHor / (_cam.hFOV / 2),
        distVer / (_cam.vFOV / 2),
      );

      let opacity = 1;
      let scale = Math.max(0.4, Math.min(1, (_sunAltitude + 10) / 90));

      if (!onScreen) {
        // Fuera de pantalla: mas pequeno y semitransparente
        opacity = Math.max(0.15, 1 - distMax * 0.4);
        scale = scale * Math.max(0.3, 1 - distMax * 0.3);
        sunCircle.style.opacity = opacity;
        sunCircle.style.transform = `scale(${scale})`;
        sunLabel.style.opacity = Math.max(0.3, opacity);
      } else {
        sunCircle.style.opacity = 1;
        sunCircle.style.transform = `scale(${scale})`;
        sunLabel.style.opacity = 1;
      }

      // Info en la etiqueta
      const azDir = azDiff > 0 ? "→" : azDiff < 0 ? "←" : "●";
      const altDir = relAlt > 0 ? "↑" : relAlt < 0 ? "↓" : "─";
      sunLabel.innerHTML =
        `${Math.round(_sunAltitude)}° alt | ${Math.round(_sunAzimuth)}° az` +
        `<br><span style="font-size:10px;opacity:0.6">` +
        `${azDir} ${Math.abs(Math.round(azDiff))}° ${altDir} ${Math.abs(Math.round(relAlt))}°` +
        `</span>`;
    } else {
      sunOverlay.classList.add("hidden");
    }

    // ===== 2. INDICADOR EN EL HORIZONTE =====
    // Solo cuando el sol esta fuera de pantalla
    if (!onScreen || !sobreHorizonte) {
      const horX = projectSunToHorizon(azDiff);
      if (horX !== null) {
        horizonIndicator.classList.remove("hidden");
        horizonIndicator.style.left = horX + "px";
        horizonIndicator.style.top = _cam.height / 2 - 14 + "px";

        if (sobreHorizonte) {
          horizonArrow.textContent = "▲";
          horizonLabel.textContent = `Sol ${Math.round(_sunAltitude)}°`;
        } else {
          horizonArrow.textContent = "▼";
          horizonLabel.textContent = `Sol ${Math.round(Math.abs(_sunAltitude))}° abajo`;
        }
      } else {
        horizonIndicator.classList.add("hidden");
      }
    } else {
      horizonIndicator.classList.add("hidden");
    }

    // ===== 3. FLECHAS DIRECCIONALES =====
    // Aparecen cuando el sol no esta centrado (umbral 8°)
    const dir = getDirectionFromDevice(azDiff, relAlt);
    const needsArrows = dir.up || dir.down || dir.left || dir.right;
    if (needsArrows) {
      searchIndicator.classList.remove("hidden");
      showArrows(dir);
      searchText.textContent = sobreHorizonte
        ? `Sigue las flechas para centrar el sol`
        : `Sol ${Math.round(Math.abs(_sunAltitude))}° bajo el horizonte`;
    } else {
      searchIndicator.classList.add("hidden");
    }

    // ===== 4. BRUJULA =====
    compassNeedle.style.transform = `rotate(${-_deviceHeading}deg)`;
  }

  /**
   * Proyecta la direccion del sol sobre la linea de horizonte
   */
  function projectSunToHorizon(azDiff) {
    if (Math.abs(azDiff) > 100) return null;
    const xRatio = azDiff / _cam.hFOV;
    let x = _cam.width / 2 + xRatio * _cam.width;
    x = Math.max(10, Math.min(_cam.width - 10, x));
    return x;
  }

  /**
   * Proyecta el sol a coordenadas de pantalla.
   * Si esta fuera, lo clampa al borde mas cercano.
   * Devuelve ademas azDiff y relAlt para los calculos.
   */
  function projectSunToScreen() {
    const azDiff = ((((_sunAzimuth - _deviceHeading) % 360) + 540) % 360) - 180;
    const relAlt = _sunAltitude - _deviceBeta;

    const xRatio = azDiff / _cam.hFOV;
    const yRatio = relAlt / (_cam.vFOV / 2);

    let x = _cam.width / 2 + xRatio * _cam.width;
    let y = _cam.height / 2 - yRatio * _cam.height;

    const margin = 0;
    const onScreen = x >= 0 && x <= _cam.width && y >= 0 && y <= _cam.height;

    // Clampear a los bordes de la pantalla para que el circulo siempre sea visible
    x = Math.max(20, Math.min(_cam.width - 20, x));
    y = Math.max(20, Math.min(_cam.height - 20, y));

    return { x, y, onScreen, azDiff, relAlt };
  }

  /**
   * Determina direccion de las flechas.
   * Umbral bajo (8°) para que sean sensibles.
   */
  function getDirectionFromDevice(azDiff, relAlt) {
    const threshold = 8;
    return {
      up: relAlt > threshold,
      down: relAlt < -threshold,
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
